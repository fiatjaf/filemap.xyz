const fetch = require('isomorphic-fetch@2.2.0')

module.exports = function (ctx, cb) {
  fetch(`https://www.eternum.io/api/pin/?key=${ctx.secrets.eternum_key}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      hash: ctx.data.hash,
      name: `filemap.xyz~${ctx.data.name}`
    })
  })
    .then(r => r.json())
    .then(data => {
      console.log('pinned', data)

      return fetch(`https://ipfs.io/ipfs/${ctx.data.hash}/filemap.xyz/${ctx.data.name}`)
        .then(r => {
          console.log('fetched from ipfs.io', r.status, r.headers)
          return fetch(`https://www.eternum.io/ipfs/${ctx.data.hash}/filemap.xyz/${ctx.data.name}`)
        })
        .then(r => {
          console.log('fetched from eternum.io', r.status, r.headers)
        })
        .catch(() => {
          console.log('failed to fetch from gateway')
        })
    })
    .catch(err => {
      console.log('error pinning', err)
    })
    .then(data => {
      cb(null, null)
    })
}
