const fetch = window.fetch
const GMaps = window.GMaps
const WebTorrent = window.WebTorrent
const dragDrop = require('drag-drop')
const uploadElement = require('upload-element')
const prettybytes = require('prettier-bytes')
const throttle = require('throttleit')
const vdom = require('virtual-dom')
const hyperx = require('hyperx')
const hx = hyperx(vdom.h)

const CLOUDANT = 'https://fiatjaf.cloudant.com/localfiles'
const TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz'
]

// init
var state = window.state = {
  center: {
    lat: 31.771959,
    lng: 35.217018
  },
  searchresults: [], // an array of docs as they come from the database (row.doc)
  seeding: {},       // {mine: Bool, torrent: Torrent, doc: doc, info: String} objects indexed by magnetURI
  downloading: {}    // {torrent: Torrent, doc: doc, info: String} indexed by magnetURI
}

const client = new WebTorrent()
client.on('warning', e => console.log(e.message))
client.on('error', e => console.log(e.message))


// every 4 minutes send keepAlive notes to the database
function keepAlive () {
  window.tc && window.tc(1)
  const ka = (new Date).getTime() + 5 * 60000
  var willupdate = []

  for (var mgn in state.seeding) {
    var doc = state.seeding[mgn].doc
    if (doc) {
      willupdate.push(doc)
    }
  }

  fetch(CLOUDANT + `/_all_docs?keys=${JSON.stringify(willupdate.map(d => d._id))}`, {
    method: 'get',
    headers: {
      'Accept': 'application/json'
    }
  })
  .then(r => r.json())
  .then(res => {
    res.rows.forEach((row, i) => {
      var doc = willupdate[i]
      if (doc.keepAlive < ka) {
        doc.keepAlive = ka
      }

      if (row.value) {
        if (!row.value.deleted) {
          doc._rev = row.value.rev
        } else {
          console.log(`during update of ${doc._id} found it was deleted, recreating it`)
          delete doc._rev
        }
      } else {
        console.log(`was updating ${doc._id}, but it was not found on the database.`)
        return
      }

      fetch(CLOUDANT + `/${doc._id}`, {
        method: 'put',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(doc)
      })
    })
  })

  setTimeout(keepAlive, 4 * 60000)
}
setTimeout(keepAlive, 4 * 60000)


// initial actions -- create map, try to geolocate, setup address search
const map = new GMaps({
  div: '#map',
  lat: state.center.lat,
  lng: state.center.lng,
  zoom: 16,
  dragend: function (e) {
    state.center = {lat: e.center.lat(), lng: e.center.lng()}
    searchFiles()
  }
})

GMaps.geolocate({
  success: function (position) {
    state.center = {lat: position.coords.latitude, lng: position.coords.longitude}
    map.setCenter(position.coords.latitude, position.coords.longitude)
  },
  error: function (error) { console.log('Geolocation failed: ' + error.message) },
  not_supported: function () { console.log('Your browser does not support geolocation') },
  always: function () {
    searchFiles()
  }
})

document.getElementById('searchaddress').addEventListener('submit', function (e) {
  e.preventDefault()
  GMaps.geocode({
    address: document.querySelector('#searchaddress input').value,
    callback: function (results, status) {
      if (status === 'OK') {
        var latlng = results[0].geometry.location
        state.center = {lat: latlng.lat(), lng: latlng.lng()}
        map.setCenter(latlng.lat(), latlng.lng())
        searchFiles()
      }
    }
  })
})

dragDrop('body', onFiles)
var upload = document.querySelector('input[name=upload]')
uploadElement(upload, function (err, files) {
  if (err) return console.log('err upload', err)
  onFiles(files.map(file => file.file))
})

function addToMap (torrent, lat, lng) {
  console.log('map clicked', lat, lng)

  saveOnDatabase(torrent, lat, lng)
  .then(doc => {
    state.seeding[torrent.magnetURI].doc = doc
    addSeedMarker(doc)
    render()
  })
  .catch(e => console.log('failed save', e))
}

function onFiles (files) {
  console.log('got files', files)
  client.seed(files, {annouce: TRACKERS}, function (torrent) {
    upload.value = upload.defaultValue

    torrent.on('warning', e => console.log(e.message))
    torrent.on('error', e => console.log(e.message))

    state.seeding[torrent.magnetURI] = {
      torrent: torrent,
      mine: true,
      doc: null,
      info: 'waiting for someone to download'
    }
    render()

    torrent.on('upload', throttle(function () {
      if (!state.seeding[torrent.magnetURI]) return
      state.seeding[torrent.magnetURI].info = seedingInfo(torrent)
      render()
    }), 200)
  })
}

function saveOnDatabase (torrent, lat, lng) {
  var doc = {
    keepAlive: (new Date).getTime() + 5 * 60000,
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lat, lng]
    },
    properties: {
      magnet: torrent.magnetURI,
      name: torrent.files[0].name + (torrent.files.length > 1
        ? ` and ${torrent.files.length - 1} other files`
        : ''),
      files: torrent.files.map(f => ({name: f.name, length: f.length}))
    }
  }

  return new Promise(function (resolve, reject) {
    GMaps.geocode({
      location: {lat: lat, lng: lng},
      callback: function (results, status) {
        if (status === 'OK') {
          resolve(results[0].formatted_address)
        } else {
          resolve(`[ ${lat.toFixed(2)}, ${lng.toFixed(2)} ]`)
        }
      }
    })
  })
  .then(address => {
    doc.properties.address = address

    return fetch(CLOUDANT + '/', {
      method: 'post',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(doc)
    })
  })
  .then(r => r.json())
  .then(res => {
    doc._id = res.id
    return doc
  })
}

function searchFiles () {
  fetch(CLOUDANT + `/_design/geo/_geo/geoidx?g=point(${state.center.lat}+${state.center.lng})&nearest=true&limit=10&include_docs=true`, {
    headers: { 'Accept': 'application/json' }
  })
  .then(r => r.json())
  .then(res => {
    console.log('result', res.rows)
    state.searchresults = res.rows.map(r => r.doc)
    render()

    // render files in map
    map.hideInfoWindows()
    map.removeMarkers()
    for (var f in state.searchresults) {
      var doc = state.searchresults[f]
      if (state.seeding[doc.properties.magnet]) {
        // we're seeding this, so it is slightly different!
        addSeedMarker(doc)
      } else {
        // these are results from others.
        map.addMarker({
          lat: doc.geometry.coordinates[0],
          lng: doc.geometry.coordinates[1],
          title: doc.properties.name,
          infoWindow: {
            content: `
              <h6>Files pinned here</h6>
              <table>
                ${doc.properties.files.map(f =>
                  `<tr><td>${f.name}</td><td>${prettybytes(f.length)}</td></tr>`
                ).join('')}
              </table>
              <h6 style="float: right">
                <a
                  href="https://instant.io/#${doc.properties.magnet}"
                  target=_blank
                  onclick="downloadFile('${doc.properties.name}', '${doc.properties.magnet}', ${doc.geometry.coordinates[0]}, ${doc.geometry.coordinates[1]})(); return false">
                    Download
                </a>
              </h6>`
          }
        })
      }
    }
  })
}

window.centerMap = function (lat, lng) {
  return function (e) {
    e.preventDefault()

    state.center = {lat: lat, lng: lng}
    map.setCenter(lat, lng)
    searchFiles()
  }
}

window.downloadFile = function (name, magnet, lat, lng) {
  return function (e) {
    if (e) e.preventDefault()

    map.hideContextMenu()
    if (state.downloading[magnet] || state.seeding[magnet]) return

    state.downloading[magnet] = {
      torrent: {},
      doc: state.searchresults.find(doc => doc.properties.magnet === magnet),
      info: 'trying to download'
    }
    render()

    client.add(magnet, function (torrent) {
      state.downloading[torrent.magnetURI].torrent = torrent
      render()

      torrent.on('warning', e => console.log(e.message))
      torrent.on('error', e => console.log(e.message))

      torrent.on('download', throttle(function () {
        if (!state.downloading[torrent.magnetURI]) return
        state.downloading[torrent.magnetURI].info = downloadingInfo(torrent)
        render()
      }), 200)
      torrent.on('noPeers', function () {
        if (!state.downloading[torrent.magnetURI]) return
        state.downloading[torrent.magnetURI].info = `couldn't find this file on the network. the person who was seeding it has probably closed the page or is offline.`
        render()
      })
      torrent.on('done', function () {
        if (!state.downloading[torrent.magnetURI]) return
        state.seeding[torrent.magnetURI] = {
          torrent: torrent,
          mine: false,
          doc: state.downloading[torrent.magnetURI].doc,
          info: 'serving the file'
        }
        delete state.downloading[torrent.magnetURI]
        render()

        torrent.files.forEach(function (file) {
          file.getBlobURL(function (err, url) {
            if (err) {
              file.blobURLError = err
              return
            }
            file.blobURL = url
            render()
          })
        })

        torrent.on('upload', throttle(function () {
          if (!state.seeding[torrent.magnetURI]) return
          state.seeding[torrent.magnetURI].info = seedingInfo(torrent)
          render()
        }), 200)
      })

      keepAlive()
    })
  }
}

window.placeOnMiddle = function (mgn) {
  return function (e) {
    e.preventDefault()
    addToMap(state.seeding[mgn].torrent, state.center.lat, state.center.lng)
  }
}


// state management
var trees = render_trees()
var nodes = {
  downloading: vdom.create(trees.downloading),
  seeding: vdom.create(trees.seeding),
  nearby: vdom.create(trees.nearby)
}
document.getElementById('downloading').appendChild(nodes.downloading)
document.getElementById('seeding').appendChild(nodes.seeding)
document.getElementById('nearby').appendChild(nodes.nearby)
function render () {
  var newTrees = render_trees()
  vdom.patch(nodes.downloading, vdom.diff(trees.downloading, newTrees.downloading))
  vdom.patch(nodes.seeding, vdom.diff(trees.seeding, newTrees.seeding))
  vdom.patch(nodes.nearby, vdom.diff(trees.nearby, newTrees.nearby))
  trees = newTrees

  var seedingWithoutLocation = Object.keys(state.seeding)
    .filter(mgn => state.seeding[mgn].mine && state.seeding[mgn].doc === null)
  if (seedingWithoutLocation.length) {
    map.setContextMenu({
      control: 'map',
      options: seedingWithoutLocation.map(mgn => ({
        title: `<b> - </b>add <b>${state.seeding[mgn].torrent.name}</b> to this place`,
        name: 'add-' + state.seeding[mgn].torrent.name,
        action: function (e) {
          addToMap(state.seeding[mgn].torrent, e.latLng.lat(), e.latLng.lng())
        }
      }))
    })
    document.querySelector('.gm-style-pbc + div').style.cursor = 'context-menu'
  } else {
    map.setContextMenu({
      control: 'map',
      options: [{
        title: 'First select a file by dragging it to this window or using the form below, then use this right-click menu to place it on the map.',
        action: function () {},
        name: 'context-menu-no-action'
      }]
    })
    map.hideContextMenu()
    var mapstyle = document.querySelector('.gm-style-pbc + div')
    if (mapstyle) mapstyle.style.cursor = 'inherit'
  }
}

function render_trees () {
  return {
    downloading: Object.keys(state.downloading).length
      ? hx`<div><h3>Downloading</h3><table>
          ${Object.keys(state.downloading).map(mgn => state.downloading[mgn]).map(data =>
            hx`<tr>
              <td>${data.doc.properties.name}</td>
              <td>${data.info}</td>
            </tr>`
          )}
        </table></div>`
      : hx`<div></div>`,
    seeding: Object.keys(state.seeding).length
      ? hx`<div><h3>Seeding</h3><table>
          ${Object.keys(state.seeding).map(mgn => state.seeding[mgn]).map(data =>
            hx`<tr>
              ${data.mine && data.doc
                ? hx`<td>${render_location(data.doc)}</td>`
                : data.mine
                  ? hx`<td><b>right-click on the map to share this somewhere</b> or <a href=# onclick=${window.placeOnMiddle(data.torrent.magnetURI)}>click here</a> to place it on the middle of the map</td>`
                  : hx`<td>Download complete</td>`
              }
              <td>
                <table>${data.torrent.files.map(f => hx`<tr>
                  <td>${f.name}</td>
                  <td>${f.blobURL
                    ? f.blobURLError
                      ? hx`<span>download error: ${f.blobURLError.message}</span>`
                      : hx`<a href=${f.blobURL} download="${f.name}">Save to computer</a>`
                    : hx`<span>${prettybytes(f.length)}</span>`
                  }</td>
                </tr>`)}</table>
              </td>
              <td>${data.info}</td>
            </tr>`
          )}
        </table></div>`
      : hx`<div></div>`,
    nearby: hx`<div><h3>Files nearby</h3><table>
      ${state.searchresults.length
        ? state.searchresults.map(doc =>
          hx`<tr>
            <td>${doc.properties.name}</td>
            <td>${render_download(doc)}</td>
            <td>at ${render_location(doc)}</td>
          </tr>`
        )
        : hx`<div>no files found anywhere.</div>`
      }
    </table></div>`
  }
}

function render_location (doc) {
  var address = doc.properties.address ||
    doc.geometry.coordinates.map(x => x.toFixed(2)).join(', ')
  return hx`<a href=# onclick=${window.centerMap(doc.geometry.coordinates, doc.geometry.coordinates[1])}>${address}</a>`
}

function render_download (doc) {
  if (state.seeding[doc.properties.magnet]) {
    return hx`<span>Downloaded</span>`
  } else if (state.downloading[doc.properties.magnet]) {
    return hx`<span>Downloading</span>`
  } else {
    return hx`<a
      href="https://instant.io/#${doc.properties.magnet}"
      target=_blank
      onclick=${window.downloadFile(doc.properties.name, doc.properties.magnet, doc.geometry.coordinates[0], doc.geometry.coordinates[1])}>Download</a>`
  }
}


// helpers
function addSeedMarker (doc) {
  map.addMarker({
    lat: doc.geometry.coordinates[0],
    lng: doc.geometry.coordinates[1],
    title: doc.properties.name,
    // draggable: true,
    icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
    infoWindow: {
      content: `<h6>Files being shared here</h6>
        <table>
          ${doc.properties.files.map(f => `<tr>
            <td>${f.name}</td>
            <td>${prettybytes(f.length)}</td>
          </tr>`).join('')}
        </table>
        <h6><a href="https://instant.io/#${doc.properties.magnet}" target=_blank>direct download link</a> (external)</h6>`
    }
  })
}

function seedingInfo (torrent) {
  return hx`<span>
    <b>peers: </b> ${torrent.numPeers},
    <b>uploaded: </b> ${prettybytes(torrent.uploaded)},
  <span>`
}

function downloadingInfo (torrent) {
  return hx`<span>
    <b>peers: </b> ${torrent.numPeers},
    <b>downloaded: </b> ${prettybytes(torrent.downloaded)},
    <b>progress: </b> ${(torrent.progress * 100).toFixed(1)}%
  </span>`
}
