// G11: no import cycles. `--ts-config tsconfig.web.json` is how the aliases resolve (@/ and @shared/):
// without it an alias cycle is missed. The web config lists every alias src/ uses.
module.exports = {
  forbidden: [{ name: 'no-circular', severity: 'error', from: {}, to: { circular: true } }],
  options: { doNotFollow: { path: 'node_modules' }, tsPreCompilationDeps: true },
};
