# Dev environment for nix users: run `nix-shell` in the repo root.
# Provides Node 22, pnpm, firebase-tools and gcloud, so nothing is installed globally.
# nixpkgs is pinned so every teammate gets the same tool versions.
# To update: pick a rev, run `nix-prefetch-url --unpack <tarball url>` and paste the hash.
{
  pkgs ? import (fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/494ce7fd23ff6a5dff39e1fb11e9b6f2ac74bf25.tar.gz";
    sha256 = "1z191lhpx4iy9igcv54qg8aaxdsn4szdldg9l6y2hs3k4w3hnb9n";
  }) { },
}:
pkgs.mkShell {
  packages = [
    pkgs.nodejs_22
    pkgs.pnpm
    pkgs.firebase-tools
    pkgs.google-cloud-sdk
    pkgs.git
  ];

  shellHook = ''
    echo "node $(node --version) | pnpm $(pnpm --version) | firebase $(firebase --version) | $(gcloud --version | head -1)"
  '';
}
