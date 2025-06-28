# nginx 설정

```code
server {
    listen 443 ssl;
    server_name <host>;
    client_max_body_size 0;
    
    location / {
        default_type text/html;
        return 200 "<h1>select server!</h1><button onclick=\"go('top')\">top (1 to 4)</button><button onclick=\"go('mid')\">mid (5 to 8)</button><script>function go(to) {window.location.assign('/'+to)}</script>";
    }
    
    location /top/ {
        proxy_pass http://<top-server>:3001/;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Accept-Encoding ""; 
    }
    
    location /mid/ {
        proxy_pass http://<mid-server>:3001/;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Accept-Encoding ""; 
    }
}
```