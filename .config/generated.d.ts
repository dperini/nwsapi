// The build creates this CommonJS module before tests run. Keep clean-tree
// type checks independent of the generated JavaScript file.
declare module '*/src/nwsapi.js' {
  const factory: (host: { document: Document }) => typeof NW.Dom
  export default factory
}
