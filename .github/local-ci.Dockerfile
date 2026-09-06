# actions-runner 2.337.0
FROM ghcr.io/actions/actions-runner@sha256:e5496277be5d09bc968b3d64911b74e219ac4a3f2edce956a3ecf9271bea1ef4

# Node 26 needs libatomic on the minimal runner image.
RUN sudo apt-get update \
 && sudo apt-get install -y --no-install-recommends libatomic1
