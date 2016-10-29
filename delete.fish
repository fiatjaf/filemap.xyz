#!/usr/bin/env fish

set now (date +%s000)
echo "now $now"
set cmd "curl --silent 'https://fiatjaf.cloudant.com/localfiles/_design/geo/_view/keep-alive?endkey=$now'"
echo $cmd
set res (eval $cmd)
echo $res | jq -r '"  will delete \(.rows | length) documents from a total of \(.total_rows)"'
for row in (echo $res | jq -c '.rows[]')
    echo $row
    set cmd (echo $row | jq -r '"curl --silent -X DELETE \'https://fiatjaf.cloudant.com/localfiles/\(.id)?rev=\(.value)\'"')
    echo $cmd
    eval $cmd
end
