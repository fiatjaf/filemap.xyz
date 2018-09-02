all: bundle.css bundle.js

deploy: _site/bundle.js _site/bundle.css _site/index.html _site/icon.png firebase.json
	./node_modules/.bin/firebase deploy --only hosting

_site:
	mkdir -p _site

_site/icon.png: _site icon.png
	cp icon.png _site/

_site/index.html: _site index.html
	cp index.html _site/

_site/bundle.js: app.js _site
	./node_modules/.bin/browserify app.js -g [ envify --NODE_ENV production ] -g uglifyify | ./node_modules/.bin/uglifyjs --compress --mangle > _site/bundle.js

_site/bundle.css: style.scss dart-sass/sass _site
	./dart-sass/sass --style compressed style.scss > _site/bundle.css

bundle.css: style.scss dart-sass/sass
	./dart-sass/sass --source-map style.scss > bundle.css

bundle.js: $(shell find -name "*.js" ! -name "bundle.js" ! -path "*node_modules*")
	./node_modules/.bin/browserifyinc -vd app.js -o bundle.js

watch:
	find -maxdepth 1 -path "./*.js" -o -name "*.scss" ! -name "bundle.js" | entr make

dart-sass/sass:
	FILE=`python3 -c 'print("dart-sass-1.13.0-" + ("linux" if "linux" in "'$$(uname -o)'".lower() else "macos") + "-" + ("x64" if "64" in "'$$(uname -m)'" else "ia32") + ".tar.gz")'` && \
        wget "https://github.com/sass/dart-sass/releases/download/1.13.0/$$FILE" -O $$FILE && \
        tar -xvf $$FILE && \
        rm $$FILE
