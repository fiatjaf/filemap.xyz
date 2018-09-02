'use strict'

const fetch = require('isomorphic-fetch@2.2.0')
const admin = require('firebase-admin@5.0.0')
const b64 = require('base64-url')
const gcs = require()

const bucket = 'numeric-analogy-147613.appspot.com'
const day = 1000 * 60 * 60 * 24

module.exports = function (ctx, cb) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: 'numeric-analogy-147613',
      clientEmail: 'firebase-adminsdk-ww6vg@numeric-analogy-147613.iam.gserviceaccount.com',
      privateKey: b64.decode(ctx.secrets.firebase_private_key)
    }),
    databaseURL: 'https://numeric-analogy-147613.firebaseio.com'
  })

  let now = Date.now()
  let fourdaysago = now - 4 * day

  Promise.all([
    eraseOldFiles(ctx, fourdaysago),
    unmapOldMarkers(ctx, fourdaysago)
  ])
    .then(res => {
      cb(null, res)
    })
    .catch(err => {
      cb(err)
    })
}

function unmapOldMarkers (ctx, fourdaysago) {
  let db = admin.database()

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

function eraseOldFiles(upto) {
  let bucket = gcs.bucket(bucket)

  bucket.getFiles({}, (err, files) => {
    if (err) throw err

    for (let i = 0; i < files.length; i++) {
      let file = files[i]
      console.log(file)
    }
  })
}
