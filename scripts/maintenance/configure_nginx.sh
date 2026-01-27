# Configure Cloudflare Real IP
sudo tee /etc/nginx/conf.d/cloudflare.conf > /dev/null <<EOF
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
EOF

# Nginx Virtual Host
sudo tee /etc/nginx/sites-available/mail.zimprices.co.zw > /dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name mail.zimprices.co.zw;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mail.zimprices.co.zw;

    ssl_certificate /etc/lego/certificates/zimprices.co.zw.crt;
    ssl_certificate_key /etc/lego/certificates/zimprices.co.zw.key;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    root /usr/lib/GNUstep/SOGo/WebServer/SOGo;

    # SOGo Proxy
    location / {
        proxy_pass http://127.0.0.1:20000;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_set_header x-webobjects-server-protocol HTTP/1.0;
        proxy_set_header x-webobjects-remote-host \$remote_addr;
        proxy_set_header x-webobjects-server-name \$server_name;
        proxy_set_header x-webobjects-server-url https://\$host;
        
        client_max_body_size 50m;
        client_body_buffer_size 128k;
    }

    # Static Assets Cache
    location ^~ /SOGo/WebServerResources/ {
        alias /usr/lib/GNUstep/SOGo/WebServerResources/;
        allow all;
        expires max;
    }
    
    location ^~ /SOGo.woa/WebServerResources/ {
        alias /usr/lib/GNUstep/SOGo/WebServerResources/;
        allow all;
        expires max;
    }
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/mail.zimprices.co.zw /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
