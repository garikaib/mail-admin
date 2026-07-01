local rspamd_logger = require "rspamd_logger"

local owned_domains = {
  ["chadzi.co.zw"] = true,
  ["chaspers.co.zw"] = true,
  ["crystalcred.co.zw"] = true,
  ["honeyscoop.co.zw"] = true,
  ["hydrodrilling.co.zw"] = true,
  ["hygienemax.co.zw"] = true,
  ["moretswana.com"] = true,
  ["rotvim.co.zw"] = true,
  ["zimpricecheck.com"] = true,
  ["zimprices.co.zw"] = true,
}

local auto_block_map = "/var/lib/rspamd/auto_phish_domains.map"
local whitelist_map_path = "/etc/rspamd/local.d/maps.d/whitelisted_domains.map"
local cached_domains = {}
local whitelisted_domains = {}

local function load_whitelist()
  local handle = io.open(whitelist_map_path, "r")
  if handle then
    for line in handle:lines() do
      local d = line:gsub("%s+", ""):lower()
      if d ~= "" and not d:match("^#") then
        whitelisted_domains[d] = true
      end
    end
    handle:close()
  end
end

load_whitelist()

local function normalize(value)
  if not value then
    return ""
  end

  return (tostring(value):lower():gsub("%s+", " "))
end

local function normalize_phrase(value)
  return (tostring(value or ""):lower():gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s+", " "))
end

local function read_map(path)
  local handle = io.open(path, "r")
  local phrases = {}

  if not handle then
    return phrases
  end

  for line in handle:lines() do
    local phrase = normalize_phrase(line)
    if phrase ~= "" and not phrase:match("^#") then
      table.insert(phrases, phrase)
    end
  end

  handle:close()
  return phrases
end

local phish_keywords = read_map("/etc/rspamd/local.d/maps.d/phish_keywords.map")
local site_issue_keywords = read_map("/etc/rspamd/local.d/maps.d/site_issues_subject.map")
local fake_delivery_keywords = read_map("/etc/rspamd/local.d/maps.d/fake_delivery_subjects.map")
local system_recipients = {
  ["www-data"] = true,
  ["webmaster"] = true,
  ["postmaster"] = true,
}

local function phrase_matches(phrases, haystack)
  for _, phrase in ipairs(phrases) do
    if haystack:find(phrase, 1, true) then
      return phrase
    end
  end

  return nil
end

local function get_sender(task)
  local from = task:get_from("mime")
  if not from or #from == 0 then
    return "", "", ""
  end

  local sender = from[1]
  return normalize(sender["domain"]), normalize(sender["addr"]), normalize(sender["name"])
end

local function get_recipients(task)
  local rcpts = task:get_recipients("smtp") or task:get_recipients("mime") or {}
  local recipients = {}

  for _, rcpt in ipairs(rcpts) do
    table.insert(recipients, {
      addr = normalize(rcpt["addr"]),
      domain = normalize(rcpt["domain"]),
      user = normalize(rcpt["user"]),
    })
  end

  return recipients
end

local function get_body(task)
  local text_parts = task:get_text_parts() or {}
  local chunks = {}

  for _, part in ipairs(text_parts) do
    local content = part:get_content() or ""
    if content ~= "" then
      table.insert(chunks, tostring(content))
    end
  end

  return normalize(table.concat(chunks, "\n"))
end

local function is_owned_domain(domain)
  return owned_domains[domain] == true
end

local function is_whitelisted(domain)
  if not domain or domain == "" then return false end
  domain = domain:lower()
  if whitelisted_domains[domain] or whitelisted_domains["." .. domain] then return true end
  
  -- Check parent domains for TLD-like whitelisting or subdomains
  local parts = {}
  for part in domain:gmatch("[^%.]+") do
    table.insert(parts, part)
  end
  
  -- Check all suffixes (e.g. for a.b.c.d, check b.c.d, c.d)
  for i = 2, #parts - 1 do
    local suffix = table.concat(parts, ".", i)
    if whitelisted_domains[suffix] or whitelisted_domains["." .. suffix] then
      return true
    end
  end
  
  return false
end

local function subject_mentions_site_issues(subject)
  return phrase_matches(site_issue_keywords, subject) ~= nil
end

local function looks_like_fake_delivery(subject, body)
  local combined = subject .. "\n" .. body
  return phrase_matches(fake_delivery_keywords, combined) ~= nil
end

local function is_mailer_daemon(sender_domain, sender_addr, sender_name)
  return sender_addr:match("^mailer%-daemon@")
    or sender_addr:match("^postmaster@")
    or sender_name:match("mail delivery")
    or sender_name:match("mail delivery system")
    or sender_domain == "mailer-daemon"
end

local function targets_system_recipient(task)
  for _, rcpt in ipairs(get_recipients(task)) do
    if owned_domains[rcpt.domain] and system_recipients[rcpt.user] then
      return true
    end
  end

  return false
end

local function contains_owned_domain_delivery_rejection(body)
  local has_owned_domain = false

  for domain, _ in pairs(owned_domains) do
    if body:find(domain, 1, true) then
      has_owned_domain = true
      break
    end
  end

  if not has_owned_domain then
    return false
  end

  return body:match("dmarc")
    or body:match("unauthenticated email")
    or body:match("not accepted due to")
    or body:match("gmail%-smtp%-in%.l%.google%.com")
end

local function looks_like_fake_support(sender_name, sender_addr, subject, body)
  local claims_support = sender_name:match("support")
    or sender_addr:match("^support@")
    or sender_addr:match("^admin@")
    or sender_name:match("webmail support")
    or sender_name:match("mail delivery")

  if not claims_support then
    return false
  end

  local combined = subject .. "\n" .. body
  return combined:match("login attempt")
    or combined:match("security")
    or combined:match("mailbox")
    or combined:match("email account")
    or combined:match("verify activity")
end

local function persist_domain(task, sender_domain, reason)
  if sender_domain == "" or is_owned_domain(sender_domain) or is_whitelisted(sender_domain) then
    return
  end

  if cached_domains[sender_domain] then
    return
  end

  local existing = io.open(auto_block_map, "r")
  if existing then
    for line in existing:lines() do
      if normalize(line) == sender_domain then
        cached_domains[sender_domain] = true
        existing:close()
        return
      end
    end
    existing:close()
  end

  local handle = io.open(auto_block_map, "a")
  if not handle then
    rspamd_logger.errx(task, "unable to append %s to %s", sender_domain, auto_block_map)
    return
  end

  handle:write(sender_domain .. "\n")
  handle:close()
  cached_domains[sender_domain] = true
  rspamd_logger.infox(task, "auto-blocked %s because of %s", sender_domain, reason)
end

rspamd_config:register_symbol({
  name = "SITE_ISSUES_TRAP",
  type = "normal",
  score = 8.0,
  description = "Send messages with 'site issues' to spam",
  callback = function(task)
    local subject = normalize(task:get_header("Subject"))

    if subject_mentions_site_issues(subject) then
      return true
    end
    return false
  end,
  group = "local_bl",
})

rspamd_config:register_symbol({
  name = "FAKE_DELIVERY_FAILURE",
  type = "normal",
  score = 20.0,
  description = "Reject fake delivery failure notices from external domains",
  callback = function(task)
    local sender_domain = get_sender(task)
    local subject = normalize(task:get_header("Subject"))
    local body = get_body(task)

    if not is_owned_domain(sender_domain) and not is_whitelisted(sender_domain) and looks_like_fake_delivery(subject, body) then
      return true
    end
    return false
  end,
  group = "local_bl",
})

rspamd_config:register_symbol({
  name = "LOCAL_BACKSCATTER_BOUNCE",
  type = "normal",
  score = 20.0,
  description = "Reject local mailer-daemon backscatter to service accounts",
  callback = function(task)
    local sender_domain, sender_addr, sender_name = get_sender(task)
    local subject = normalize(task:get_header("Subject"))
    local body = get_body(task)

    if is_owned_domain(sender_domain)
      and is_mailer_daemon(sender_domain, sender_addr, sender_name)
      and targets_system_recipient(task)
      and looks_like_fake_delivery(subject, body)
      and contains_owned_domain_delivery_rejection(body) then
      return true
    end

    return false
  end,
  group = "local_bl",
})

rspamd_config:register_symbol({
  name = "LOCAL_PHISH_KEYWORD",
  type = "normal",
  score = 20.0,
  description = "Reject phishing themes and auto-block sender domain",
  callback = function(task)
    local sender_domain = get_sender(task)
    local subject = normalize(task:get_header("Subject"))
    local body = get_body(task)
    local combined = subject .. "\n" .. body
    local keyword = phrase_matches(phish_keywords, combined)

    if keyword and not is_owned_domain(sender_domain) and not is_whitelisted(sender_domain) then
      persist_domain(task, sender_domain, keyword)
      return true
    end
    return false
  end,
  group = "local_bl",
})

rspamd_config:register_symbol({
  name = "FAKE_SUPPORT_IMPERSONATION",
  type = "normal",
  score = 20.0,
  description = "Reject fake support impersonation and auto-block sender domain",
  callback = function(task)
    local sender_domain, sender_addr, sender_name = get_sender(task)
    local subject = normalize(task:get_header("Subject"))
    local body = get_body(task)

    if not is_owned_domain(sender_domain) and not is_whitelisted(sender_domain) and looks_like_fake_support(sender_name, sender_addr, subject, body) then
      persist_domain(task, sender_domain, "support impersonation")
      return true
    end
    return false
  end,
  group = "local_bl",
})

rspamd_config:register_symbol({
  name = "CNN_HEALTH_SPAM_DETECTED",
  type = "normal",
  score = 25.0,
  description = "Reject CNN Health / Memory Restoration spam",
  callback = function(task)
    local subject = normalize(task:get_header("Subject"))
    local from = task:get_from("mime")
    local from_name = ""
    if from and from[1] then
      from_name = normalize(from[1]["name"])
    end
    
    local body = get_body(task)
    local combined = subject .. "\n" .. from_name .. "\n" .. body
    
    local keywords = {
      "cnn news",
      "cnn health",
      "memory restoration",
      "alzheimer",
      "bill gates invest",
      "medical alert",
      "microsoft sharepoint",
      "tiktok shop",
      "jordan from tiktok",
      "contract document",
      "competitors launched",
      "olivia smith",
      "daniel perez",
      "rohit singh",
      "seo proposal",
      "seo plan",
      "product boxes",
      "ranking on google",
      "lost traffic and leads",
      "taylor from tiktok",
      "digital marketing masterclass",
    }
    
    for _, kw in ipairs(keywords) do
      if combined:find(kw, 1, true) then
        return true
      end
    end
    
    return false
  end,
  group = "local_bl",
})
