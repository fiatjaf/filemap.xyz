const fetch = window.fetch
const GMaps = window.GMaps
const WebTorrent = window.WebTorrent
const dragDrop = require('drag-drop')
const uploadElement = require('upload-element')

const CLOUDANT = 'https://fiatjaf.cloudant.com/localfiles'
const TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz'
]

// init
var state = {
  center: {
    lat: 31.771959,
    lng: 35.217018
  },
  searchresults: [],
  seeding: {},
  downloading: {}
}

const client = new WebTorrent()
client.on('warning', e => console.log(e.message))
client.on('error', e => console.log(e.message))


// initial actions -- create map, try to geolocate, setup address search
const map = new GMaps({
  div: '#map',
  lat: state.center.lat,
  lng: state.center.lng,
  dragend: function (e) {
    state.center = {lat: e.center.lat(), lng: e.center.lng()}
    searchFiles()
  }
})

GMaps.geolocate({
  success: function (position) {
    map.setCenter(position.coords.latitude, position.coords.longitude)
    searchFiles()
  },
  error: function (error) { console.log('Geolocation failed: ' + error.message) },
  not_supported: function () { console.log('Your browser does not support geolocation') }
})

document.getElementById('searchaddress').addEventListener('submit', function (e) {
  e.preventDefault()
  GMaps.geocode({
    address: document.querySelector('#searchaddress input').value,
    callback: function (results, status) {
      if (status === 'OK') {
        var latlng = results[0].geometry.location
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
  state.seeding[torrent.magnetURI].location = {lat: lat, lng: lng}
  render()
}

function onFiles (files) {
  console.log('got files', files)
  client.seed(files, {annouce: TRACKERS}, function (torrent) {
    upload.value = upload.defaultValue

    torrent.on('warning', e => console.log(e.message))
    torrent.on('error', e => console.log(e.message))

    state.seeding[torrent.magnetURI] = {torrent: torrent, location: null}
    render()
  })
}

function saveOnDatabase (torrent, lat, lng) {
  var doc = {
    _id: '' + (new Date()).getTime(),
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lat, lng]
    },
    properties: {
      magnet: torrent.magnetURI,
      name: torrent.name,
      files: torrent.files.map(f => ({name: f.name, length: f.length}))
    }
  }

  fetch(CLOUDANT + '/', {
    method: 'post',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(doc)
  })
  .then(res => {
    seedMarker(doc)
  })
  .catch(e => console.log('failed save', e))
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
        seedMarker(doc)
      } else {
        // these are results from others.
        map.addMarker({
          lat: doc.geometry.coordinates[0],
          lng: doc.geometry.coordinates[1],
          title: doc.properties.name,
          infoWindow: {
            content: `${doc.properties.name} <a href="https://instant.io/#${doc.properties.magnet}" onclick="downloadFile('${doc.properties.name}', '${doc.properties.magnet}', ${doc.geometry.coordinates[0]}, ${doc.geometry.coordinates[1]}); return false">download</a><br>files:<ul>
              ${doc.properties.files.map(f =>
                `<li>${f.name}: ${(f.length / 1000).toFixed(0)}kb</li>`
              ).join('')}
            </ul>`
          }
        })
      }
    }
  })
}

window.downloadFile = function (name, magnet, lat, lng) {
  if (state.downloading[magnet] || state.seeding[magnet]) return

  state.downloading[magnet] = {torrent: {}, name: name, info: 'trying to download'}
  render()

  client.add(magnet, function (torrent) {
    state.downloading[torrent.magnetURI].torrent = torrent
    render()

    torrent.on('warning', e => console.log(e.message))
    torrent.on('error', e => console.log(e.message))

    torrent.on('download', function () {
      state.downloading[torrent.magnetURI].info = `
        <b>peers: </b> ${torrent.numPeers},
        <b>downloaded: </b> ${(torrent.downloaded / 1000).toFixed(0)}kb,
        <b>progress: </b> ${(torrent.progress * 100).toFixed(2)}%
      `
      render()
    })
    torrent.on('noPeers', function () {
      state.downloading[torrent.magnetURI].info = `couldn't find this file on the network. the person who was seeding it has probably closed the page or is offline.`
      render()
    })
    torrent.on('done', function () {
      delete state.downloading[torrent.magnetURI]
      state.seeding[torrent.magnetURI] = {torrent: torrent, location: {lat: lat, lng: lng}}
      render()
    })
  })
}


// state management
function render () {
  document.getElementById('downloading').innerHTML = Object.keys(state.downloading).length
    ? `<h3>Downloading</h3><ul>
        ${Object.keys(state.downloading).map(mgn => state.downloading[mgn]).map(data =>
          `<li>
            ${data.name} - ${data.info}
          </li>`
        ).join('')}
      </ul>`
    : ''

  document.getElementById('seeding').innerHTML = Object.keys(state.seeding).length
    ? `<h3>Seeding</h3><ul>
        ${Object.keys(state.seeding).map(mgn => state.seeding[mgn]).map(data =>
          `<li>
            ${data.torrent.name} - 
            ${data.location ? data.location.lat + ', ' + data.location.lng : 'click on the map to share this'}
          </li>`
        ).join('')}
      </ul>`
    : ''

  document.getElementById('nearby').innerHTML = `<h3>Files nearby</h3><ul>
    ${state.searchresults.map(doc =>
      `<li>${doc.properties.name} <a href="https://instant.io/#${doc.properties.magnet}" target=_blank onclick="downloadFile('${doc.properties.name}', '${doc.properties.magnet}', ${doc.geometry.coordinates[0]}, ${doc.geometry.coordinates[1]}); return false">download</a> from ${doc.geometry.coordinates[0]}, ${doc.geometry.coordinates[1]}</li>`
    ).join('')}
  </ul>`

  var seedingWithoutLocation = Object.keys(state.seeding)
    .filter(mgn => state.seeding[mgn].location === null)
  if (seedingWithoutLocation.length) {
    map.setContextMenu({
      control: 'map',
      options: seedingWithoutLocation.map(mgn => ({
        title: `add ${state.seeding[mgn].torrent.name} to this place`,
        name: 'add-' + state.seeding[mgn].torrent.name,
        action: function (e) {
          addToMap(state.seeding[mgn].torrent, e.latLng.lat(), e.latLng.lng())
        }
      }))
    })
    document.querySelector('.gm-style-pbc + div').style.cursor = 'context-menu'
  } else {
    map.hideContextMenu()
    document.querySelector('.gm-style-pbc + div').style.cursor = 'inherit'
  }
}


// helpers
function seedMarker (doc) {
  map.addMarker({
    lat: doc.geometry.coordinates[0],
    lng: doc.geometry.coordinates[1],
    title: doc.properties.name,
    // draggable: true,
    icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
    infoWindow: {
      content: `files being shared:<ul>
        ${doc.properties.files.map(f =>
          `<li>${f.name}: ${(f.length / 1000).toFixed(0)}kb</li>`
        ).join('')}
      </ul><a href="https://instant.io/#${doc.properties.magnet}" target=_blank>direct download/seed link</a>`
    }
  })
}
