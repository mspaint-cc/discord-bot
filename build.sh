cd mspaint-src
rm -rf Distribution/
lune run Build bundle input="default.project.json" minify=true output="Distribution/Script.luau" env-name="Script" darklua-config-path="Build/DarkLua.json" temp-dir-base="Distribution" verbose=true
