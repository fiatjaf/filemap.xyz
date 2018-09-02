/** @format */

const functions = require('firebase-functions')
const admin = require('firebase-admin')
const gcs = require('@google-cloud/storage')()

const day = 1000 * 60 * 60 * 24

exports.cleanup = functions.https.onRequest((r, w) => {
  admin.initializeApp(functions.config().firebase)
  let now = Date.now()
  let fourdaysago = now - 4 * day

  unmapOldMarkers(fourdaysago)
  eraseOldFiles(fourdaysago)
})

function unmapOldMarkers(upto) {
  let db = admin.database()

  let q = db
    .ref('/files')
    .orderByChild('timestamp')
    .endAt(upto)

  return new Promise(resolve => {
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
  let storage = admin.database().ref()
  let bucket = gcs.bucket(storage.bucket)

  bucket.getFiles({}, (err, files) => {
    if (err) throw err

    for (let i = 0; i < files.length; i++) {
      let file = files[i]
      console.log(file)
    }
  })
}
