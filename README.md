StallTCP1.3 Fixed Version 

⚡️ StallTCP - v1.3 

🥇 Mainly introduced buffering and strategically selected transmission modes. 

🥈 Buffering inevitably leads to strategies, and strategies adapt to the user's window to optimize the user experience. 

🥉 The current strategies include direct, adaptive, and buffered.

❇️ Fixed the logic issue where small data requests are more critical in daily use.

❇️ Fixed the issue where long-term frequent peak states in the download queue could block the upload queue.

❇️ Adapted for ProxyIP usage, with the path format: /proxyip=ip:port.

❇️ 🫡 Paying tribute to the original author: Alexandre_Kojeve.

❇️ Produced by Tiancheng Technical Exchange Group @zyssadmin.

❇️ All parameters are adjustable; this code is primarily for experimental purposes, and no responsibility is taken for any consequences.



🥇 部署配置



vless://UUID@项目域名:443?encryption=none&security=tls&type=ws&host=项目域名&path=%2F#CF-Worker节点

vless://UUID@优选域名:443?encryption=none&security=tls&sni=项目域名&alpn=http%2F1.1&fp=firefox&allowInsecure=1&type=ws&host=项目域名&path=%2F#Sinppets



🥈实例

<img width="787" height="416" alt="image" src="https://github.com/user-attachments/assets/713f2a42-7060-48ef-b312-0bccd602b45b" />



PS: Current major code issues:

⚠️ The current strategy uses direct as the default transmission mode, while using buffered for large file downloads - this is incorrect. In theory, large file downloads require the zero-copy mechanism of direct mode more, but the current code uses buffered, which causes browser downloads of large files to disconnect at 1.8G, 2.8G, 3.5G (under my bandwidth conditions) and fail to properly reconnect to new instances.

⚠️ The download queue being in a long-term frequent peak state can cause the upload queue to be blocked.

✳️ Use AI to modify the logic:

✅ Reverse the strategy logic - daily small data requests are more important for the buffered mechanism to reduce send() calls.

✅ Modify the upload queue priority or reserve certain memory for the upload queue to avoid blocking.

Since this is not the final code, the current code errors have been resolved in iterative versions, but I will not modify this stage version - test it yourself.

All parameters are adjustable during execution. This code is mainly for experimental purposes, and no responsibility is taken for any consequences.
