cd mspaint-src

if [ -d "Distribution" ]; then
    rm -rf Distribution/
fi

bash build.sh