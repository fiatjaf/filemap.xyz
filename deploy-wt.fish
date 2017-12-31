wt create --secret eternum_key=(cat credentials.json | jq -r '.eternum.key') --secret firebase_private_key=(cat credentials.json | jq -r '.firebase.private_key | @base64') --name filemap-cleanup ./webtasks/cleanup.js 

wt create --secret eternum_key=(cat credentials.json | jq -r '.eternum.key') --name filemap-pin ./webtasks/pin.js
