/* global L, notie, google, alert */

const firebase = require('firebase')
const GeoFire = require('geofire')
const places = require('places.js')
const throttle = require('throttleit')
const SimpleEncryptor = require('simple-encryptor')
const Dropzone = require('dropzone')
Dropzone.autoDiscover = false

const { fileTypeIcon } = require('./helpers')
const SALT = 'a stupid salt just to please the lib'

firebase.initializeApp({
  apiKey: 'AIzaSyBMMiudi0y6Xnyy4UZW8l7y2RHvFKDjt1c',
  authDomain: 'numeric-analogy-147613.firebaseapp.com',
  databaseURL: 'https://numeric-analogy-147613.firebaseio.com',
  projectId: 'numeric-analogy-147613',
  storageBucket: 'numeric-analogy-147613.appspot.com',
  messagingSenderId: '70472198826'
})

let filekeys = firebase.database().ref('files')
let geofire = new GeoFire(firebase.database().ref('geo'))

var keysInRange = {}


// MAP


let lat = parseFloat(localStorage.getItem('lat') || 51.505)
let lng = parseFloat(localStorage.getItem('lng') || -0.09)
let zoom = parseInt(localStorage.getItem('zoom') || 14)

var map = L.map('map').setView([lat, lng], zoom)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
  minZoom: 5,
  id: 'osm.tiles'
}).addTo(map)

const q = geofire.query({
  center: [lat, lng],
  radius: zoomToRadius(zoom)
})

q.on('key_entered', handleKeyEntered)
q.on('key_exited', handleKeyExited)
q.on('key_moved', (a, b, c) => {
  handleKeyExited(a, b, c)
  handleKeyEntered(a, b, c)
})

function handleKeyEntered (key, [lat, lng], distance) {
  let marker = L.marker([lat, lng], {
    icon: L.icon.glyph({
      prefix: 'fa',
      glyph: 'folder',
      glyphSize: '11px',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA3XAAAN1wFCKJt4AAAAB3RJTUUH4QwbFCoLsLJBFAAABCdJREFUWMO1l01oXFUUx3/3vjvvTTKxtqGk9QOhpR8asQtd2CoouBRcuSqC4N6FCFVpEVoUP2op6kJF0S7UduFCqNCFuhAsRgRb01pIRUVosW3aTiYzmfd57z0u3kybpk0yScY/HB7DvMv/3v//nHvOU/SIq49ilGKd96xXivrtA/xrvifrZa1a6M8rj3CnUuzUimcFHhBBAk0mQuiFIND84zyfB5rDq39kYkkk049xW2HZA7xQi3DVKoOEgJ71kgcKyFKyOEd7zxGteWX4OBcWJZncwahSfDdQYU1tFQMEgOuEzFmpgaD8mbXImgkF8NTIGD/MS3JxO49rxbG1Q0RqkAAH2B5E10AFSJErLQoRnhsZ4/BNJBceZrPWnBxZRY2olAJP71BAWG7qSoNMhCdGxvjpGsnF7YTAxHCNeyo1ArI50iwFEZAjk02mrWPjXb8w1bXyeaNZ1yXwHrwsL8iAEDVQoRpo9gKoSzsYdJ5Ld6xmiABczooRVEqNLlwlt44N2jqerAQoQrB5qdJKwxZlMgyG2EDztFGKnUMRgzgQoX+wUIsYbGc8Y5znwcigsB1N+wRxYAJwnlHjhbVKg+vzSQoHYQW8MGS8EAI4v/ysveVJrj+VASad426lQHwfWRRIAUCigT+TAowu5epXBBpyB8B57TxHZ1JipfuTvt0wAbRScus4qkU4FuelL4rlV/oNVd/BTIYT4Ru9+TfOeuGvVgKh6Y9UYQBxBtbRTC3HNeXu36u3iSud3rBiEgONmFiEA9vO4HRHpi/TAp1ZqAQr86ISQG6hlWKs59Nuu2HLOE3gk3qbLFqhZNUKTMXkSvHF6GmmmN21vfBOM0HnrtzNcgw3AVgP0wlKwf7ZjROA0dOcAz6ut0mqleWdIjJQb5MDX20Z5+xNJABKsW8mRecWosrSvXAemgnKeV6dOwJcw9ZxLgu820iIq6b3TIPSi3qbTCsOjZ7m73lJKHf01kyKpLbM917rwnqIc5TAa7caZm7AppM0gLfrbZLQlFIsZHZXqkZMKsIHW8c5vygJQGg4mBXkmS3NXNQLgXYGzvPmfGPZTdh4grYX9jVi4siUd9p8XkQGptqkAgfv/53JnkkAkoIPC0ecFPPfaZEpvcgsXoQDCw2Yt8RDE6Qi7GkmJJEBPacVdGRlOiEB3uhW95JIANbU+Mx6LidFmUGzDQ8NZAXkliI0vL/YqDwv1o1hRdg9HZOGBrS6sS5aKbEIezf8SmvZJJQd7ojAuThHupdn1UBmwXrS0PBRL0P/gth0Eu+Fl2dSskpQXoKhgZmU2Hl2bzxBsmISgPtO8bXAH0mBDEXXTtEcrnGol/W65zlK2JXk5L4svMQLL63/mbyvJPee4lsvjDdixHkuFe76l1TfSDp40XkUsGvbGRz/Fya28fr+RT7N5+I/xSZVYWIfd+EAAAAASUVORK5CYII='
    }),
    riseOnHover: true
  }).addTo(map)

  let handler = filekeys.child(key).on('value', snap => {
    let value = snap.val()
    if (!value) {
      handleKeyExited(key)
      return
    }

    let {name, files, encrypted} = value

    keysInRange[key].files = files
    keysInRange[key].name = name

    if (name) {
      marker.bindTooltip(name, {
        offset: [0, -7],
        opacity: 0.6
      })
    }

    if (encrypted) {
      marker.bindPopup(`
  <h6 class="subtitle is-6">${name}</h6>
  <form class="enter-password">
    <label for="p-${key}">Password:</label>
    <div class="field has-addons">
      <div class="control">
        <input id="p-${key}" name="password" class="input">
      </div>
      <div class="control">
        <button class="button is-primary">Ok</button>
      </div>
    </div>
    <span class="help">These files are protected by a password.</span>
  </form>
      `)
    } else {
      attachPlainTextFilesPopup(marker, name, files)
    }
  })

  keysInRange[key] = {
    distance,
    lat,
    lng,
    marker,
    handler
  }
}

document.querySelector('.leaflet-popup-pane')
  .addEventListener('submit', handlePasswordEntered)

function handlePasswordEntered (e) {
  e.preventDefault()

  let key = e.target.password.id.slice(2)
  let { marker, name, files } = keysInRange[key]

  let password = e.target.password.value + SALT
  let w = SimpleEncryptor(password)

  var decryptedfiles = {}
  for (let enck in files) {
    try {
      let k = w.decrypt(enck)
      let v = w.decrypt(files[enck])
      decryptedfiles[k] = v
      if (!k || !v) {
        throw new Error(`couldn't decrypt ${enck} / ${files[enck]}.`)
      }
    } catch (e) {
      notie.alert({
        type: 'warning',
        text: 'Wrong password!'
      })
      return false
    }
  }
  notie.alert({
    type: 'success',
    text: 'Correct password!'
  })

  attachPlainTextFilesPopup(marker, name, decryptedfiles)
  return false
}

function attachPlainTextFilesPopup (marker, name, files) {
  marker.bindPopup(`
  <h6 class="subtitle is-6">${name}</h6>
  <ul>${Object.keys(files).map(key =>
    `<li>
      <i class="fa ${fileTypeIcon(files[key])}"></i>
      &nbsp;
      <a href="https://file.io/${key}">${files[key]}</a>
     </li>`
  ).join('')}</ul>
  `)
}

function handleKeyExited (key) {
  let { marker, handler } = keysInRange[key]

  marker.remove()
  filekeys.child(key).off('value', handler)

  delete keysInRange[key]
}

map.on('zoomend', handleMapMove)
map.on('moveend', handleMapMove)

var circle = {remove () {}}
circle.remove()

function handleMapMove () {
  let {lat, lng} = map.getCenter()
  let zoom = map.getZoom()

  localStorage.setItem('lat', lat)
  localStorage.setItem('lng', lng)
  localStorage.setItem('zoom', zoom)

  q.updateCriteria({
    center: [lat, lng],
    radius: zoomToRadius(zoom)
  })

  // debugging the radius
  // circle.remove()
  // circle = L.circle([lat, lng], {
  //   color: 'red',
  //   fillColor: '#f03',
  //   fillOpacity: 0.3,
  //   radius: zoomToRadius(zoom) * 1000
  // }).addTo(map)

  if (!targetPos) {
    updateTargetAddress({lat, lng})
  }
}

function zoomToRadius (z) {
  return 110 * 2 ** (9 - z)
}


// SEARCH


var search = places({
  container: document.getElementById('search')
})

search.on('change', e => {
  let {lat, lng} = e.suggestion.latlng

  map.setView([lat, lng], map.getZoom())
  q.updateCriteria({
    center: [lat, lng]
  })
})


// UPLOAD


let uploadForm = document.getElementById('upload')
uploadForm.addEventListener('submit', e => {
  e.preventDefault()

  let nfiles = Object.keys(files).length
  if (nfiles === 0) {
    notie.alert({
      type: 'info',
      text: 'Please upload at least one file before saving a place in the map.'
    })
    return
  }

  let password = e.target.password.value.trim() + SALT
  if (password) {
    let w = SimpleEncryptor(password)
    var encryptedfiledata = {}
    for (let k in files) {
      encryptedfiledata[w.encrypt(k)] = w.encrypt(files[k])
    }
    console.log(encryptedfiledata)
    files = encryptedfiledata
  }

  let ref = filekeys.push({
    name: e.target.name.value,
    address: address.value,
    files: files,
    timestamp: Date.now() / 1000,
    encrypted: !!password
  }, () => {
    e.target.name.value = ''
    e.target.password.value = ''
    address.value = ''
    files = {}
    dz.removeAllFiles()
    resetTargetMarker()
    targetPos = null

    notie.alert({
      type: 'success',
      text: `${nfiles} file${nfiles === 1 ? '' : 's'} saved!`
    })
  })

  let {lat, lng} = targetPos || map.getCenter()
  geofire.set(ref.key, [lat, lng])
})

var targetPos = null
var targetMarker
resetTargetMarker()
function resetTargetMarker () {
  targetMarker ? targetMarker.remove() : null
  targetMarker = {
    remove () {},
    notYetSet: true
  }
}
map.on('click', e => {
  let {lat, lng} = e.latlng
  targetPos = {lat, lng}
  updateTargetAddress({lat, lng})

  if (targetMarker.notYetSet) {
    targetMarker = L.marker([lat, lng], {
      draggable: true,
      keyboard: false,
      icon: L.icon.glyph({
        prefix: 'fa',
        glyph: 'cloud-upload',
        glyphSize: '15px'
      }),
      riseOnHover: true
    }).addTo(map)

    targetMarker.bindTooltip('Your files will be added to this place', {
      offset: [0, -17],
      permanent: true,
      opacity: 0.9
    }).openTooltip()

    targetMarker.on('move', throttle(function (e) {
      let {lat, lng} = e.latlng
      targetPos = {lat, lng}
      updateTargetAddress({lat, lng})
    }, 450))
  } else {
    targetMarker.setLatLng([lat, lng])
  }
})

var address = document.getElementById('address')

const geocoder = new google.maps.Geocoder()
const updateTargetAddress = throttle(function ({lat, lng}) {
  geocoder.geocode({location: {lat, lng}}, (results, status) => {
    if (status === 'OK') {
      if (results[0]) {
        address.value = results[0].formatted_address
        return
      }
    }
    address.value = `lat: ${lat}, lng: ${lng}`
  })
}, 700)

var keysByDropzoneUUIDs = {}
var files = {}
var dz = new Dropzone('#files', {
  url: 'https://file.io',
  paramName: 'file',
  addRemoveLinks: true
})
dz.on('removedfile', e => {
  let removedKey = keysByDropzoneUUIDs[e.upload.uuid]
  delete files[removedKey]
})
dz.on('success', e => {
  let res = JSON.parse(e.xhr.responseText)
  if (res.success) {
    files[res.key] = e.upload.filename
    keysByDropzoneUUIDs[e.upload.uuid] = res.key
  } else {
    alert(e.xhr.responseText)
    dz.removeFile(e.upload)
  }
})
