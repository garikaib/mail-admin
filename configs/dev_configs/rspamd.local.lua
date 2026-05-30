-- Rspamd local.lua (Development Sandbox Config)

-- Add spam filters and security settings
rspamd_config:register_symbol{
  name = 'CNN_HEALTH_SPAM_DETECTED',
  score = 25.0,
  description = 'Reject CNN Health / Memory Restoration spam',
  callback = function(task)
    local from = task:get_from()
    if from and from[1] and from[1].addr then
      local addr = from[1].addr:lower()
      if addr:find('cnn health') or addr:find('memory restoration') then
        return true
      end
    end
    return false
  end
}
