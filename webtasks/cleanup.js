'use strict'

const fetch = require('isomorphic-fetch@2.2.0')
const admin = require('firebase-admin@5.0.0')
const b64 = require('base64-url')

module.exports = function (ctx, cb) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: 'numeric-analogy-147613',
      clientEmail: 'firebase-adminsdk-ww6vg@numeric-analogy-147613.iam.gserviceaccount.com',
      privateKey: b64.decode(ctx.secrets.firebase_private_key)
    }),
    databaseURL: 'https://numeric-analogy-147613.firebaseio.com'
  })

  Promise.all([
    unpinOldHashes(ctx),
    unmapOldMarkers(ctx)
  ])
    .then(res => {
      cb(null, res)
    })
    .catch(err => {
      cb(err)
    })
}

const day = 1000 * 60 * 60 * 24

function unmapOldMarkers () {
  let db = admin.database()
  let now = Date.now()
  let fourdaysago = now - (4 * day)

  let q = db.ref('/files')
    .orderByChild('timestamp')
    .endAt(fourdaysago)

  return new Promise((resolve) => {
    setTimeout(resolve, 500)

    q.on('child_added', child => {
      let data = child.val()
      let ref = child.ref
      console.log('removing', ref.key, data)

      ref.remove(e => {
        console.log('removed files ref', data, e)
      })

      db.ref(`/geo/${ref.key}`).remove(e => {
        console.log('removed geo ref', data, e)
      })
    })
  })
}

function unpinOldHashes (ctx) {
  let now = Date.now()
  let fourdaysago = now - (4 * day)

  return fetch(`https://www.eternum.io/api/pin/?key=${ctx.secrets.eternum_key}`)
    .then(r => r.json())
    .then(res =>
      Promise.all(
        res.results.map(pin => {
          let added = new Date(pin.added)
          if (pin.name.split('~')[0] === 'filemap.xyz' && added.getTime() < fourdaysago) {
            return fetch(`https://www.eternum.io/api/pin/${pin.hash}?key=${ctx.secrets.eternum_key}`, {method: 'DELETE'})
              .then(r => r.json())
              .then(res => console.log('unpinned', pin, res))
              .catch(err => console.log('failed to unpin', pin, err))
          }
        })
      )
    )
    .catch(err => console.log('failed to fetch pins from eternum', err))
}
