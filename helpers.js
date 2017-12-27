let mimeTypes = require('render-media/lib/mime.json')

module.exports.fileTypeIcon = function fileTypeIcon (filename) {
  let splitted = filename.split('.')
  let ext = splitted.slice(-1)[0]
  if (!ext || splitted[0] === '') return 'fa-file'

  let mime = mimeTypes['.' + ext]
  if (mime) {
    if (mime.indexOf('audio') !== -1) return 'fa-file-audio-o'
    if (mime.indexOf('video') !== -1) return 'fa-file-video-o'
    if (mime.indexOf('zip') !== -1) return 'fa-file-archive-o'
    if (mime.indexOf('archive') !== -1) return 'fa-file-archive-o'
    if (mime.indexOf('image') !== -1) return 'fa-file-image-o'
    if (mime.indexOf('text') !== -1) return 'fa-file-text-o'
  }

  switch (ext) {
    case 'pdf':
      return 'fa-file-pdf-o'
    case 'ppt':
    case 'pptx':
    case 'pps':
    case 'odp':
      return 'fa-file-powerpoint-o'
    case 'opus':
      return 'fa-file-audio-o'
    case 'js':
    case 'jsx':
    case 'coffee':
    case 'es':
    case 'es6':
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'py':
    case 'rb':
    case 'rs':
    case 'ts':
    case 'json':
    case 'xml':
    case 'go':
    case 'nim':
    case 'hs':
    case 'elm':
      return 'fa-file-code-o'
    case 'doc':
    case 'docx':
    case 'odt':
      return 'fa-file-word-o'
    case 'xls':
    case 'xlsx':
    case 'ods':
      return 'fa-file-excel-o'
    case '7z':
    case 'rar':
    case 'tar':
    case 'xz':
      return 'fa-file-archive-o'
  }

  return 'fa-file-o'
}

