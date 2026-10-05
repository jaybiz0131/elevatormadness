// the only non-default: .glb files are assets, so `import url from './x.glb?inline'` gives a data URL (the build is one HTML file)
export default { assetsInclude: ['**/*.glb'] };
