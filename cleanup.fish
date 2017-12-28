#!/usr/bin/env fish

set base 'https://numeric-analogy-147613.firebaseio.com'

for key in (curl "$base/files.json" | jq -rc 'map_values(.timestamp < (now - (60*60*24*13))) | to_entries | map(select(.value)) | map(.key) | .[]')
  curl -X DELETE "$base/files/$key.json"
  curl -X DELETE "$base/geo/$key.json"
end
