import * as stylexRuntime from '@stylexjs/stylex';

type StyleXClassName = string;
type StyleXInput = Parameters<typeof stylexRuntime.legacyMerge>;

function stylex(...styles: StyleXInput): StyleXClassName {
  return stylexRuntime.legacyMerge(...styles);
}

stylex.create = stylexRuntime.create;
stylex.props = stylexRuntime.props;
stylex.keyframes = stylexRuntime.keyframes;
stylex.defineVars = stylexRuntime.defineVars;
stylex.defineConsts = stylexRuntime.defineConsts;
stylex.createTheme = stylexRuntime.createTheme;
stylex.types = stylexRuntime.types;

export default stylex;
