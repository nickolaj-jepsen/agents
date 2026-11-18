# Link the pi packages a checkout's TypeScript and stories need. Use the flake's pi by default;
# PI_MONOREPO lets a media shell or a consumer select another one.
{
  writeShellApplication,
  coreutils,
  pi-coding-agent,
}:
writeShellApplication {
  name = "pi-dev-links";
  runtimeInputs = [coreutils];
  text = ''
    pi=''${PI_MONOREPO:-${pi-coding-agent}/lib/node_modules/pi-monorepo}
    modules=''${1:-node_modules}

    mkdir -p "$modules/@earendil-works" "$modules/@types"
    ln -sfn "$pi" "$modules/@earendil-works/pi-coding-agent"
    for dep in "$pi"/node_modules/@earendil-works/*; do
      ln -sfn "$dep" "$modules/@earendil-works/"
    done
    # TypeBox as pi aliases it, and Node's types.
    ln -sfn "$pi/node_modules/typebox" "$modules/typebox"
    ln -sfn "$pi/node_modules/@types/node" "$modules/@types/node"
  '';
}
