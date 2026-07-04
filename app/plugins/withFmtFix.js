// ================================================================
// withFmtFix.js - Expo config plugin that fixes the fmt/consteval
// build failure on Xcode 26+.
//
// The problem: React Native 0.79 ships the "fmt" C++ library, and
// fmt's compile-time format checking (a C++20 feature called
// consteval) makes newer Xcode compilers error out with:
//   "call to consteval function ... is not a constant expression"
//
// The fix: define FMT_USE_CONSTEVAL=0 for every pod, which is
// fmt's own official switch to do those checks at runtime instead.
// Functionally identical output, compiles everywhere.
//
// Why a config plugin? The ios/ folder is regenerated from scratch
// on every EAS cloud build (and by `npx expo prebuild`), so editing
// the Podfile by hand doesn't stick. This plugin re-applies the fix
// automatically during every prebuild, local or cloud.
// ================================================================

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// The Ruby snippet injected into the Podfile's post_install hook.
// Written defensively: works whether the existing setting is an
// Array, a String, or missing, and never adds the flag twice.
const RUBY_SNIPPET = `
    # --- fmt/consteval fix (added by plugins/withFmtFix.js) ---
    # Two fixes for building with new Xcode versions, applied to
    # every pod:
    #  1. Some pods declare an ancient minimum iOS (13.4); new
    #     Xcode refuses anything under 15.0. Raise them to 15.1.
    #  2. fmt's consteval format checking breaks the new compiler.
    #     FMT_USE_CONSTEVAL=0 is fmt's official switch to do the
    #     same checks at runtime instead.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.1
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
        defs = Array(config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)'])
        defs << 'FMT_USE_CONSTEVAL=0' unless defs.include?('FMT_USE_CONSTEVAL=0')
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
      end
    end
    # IMPORTANT: the compiler flag above is NOT enough by itself -
    # fmt 11.x's header re-defines FMT_USE_CONSTEVAL unconditionally,
    # ignoring any predefined value. So we patch the header file
    # itself, right here after pods are downloaded: every branch
    # that would set it to 1 is rewritten to 0.
    fmt_base = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      src = File.read(fmt_base)
      unless src.include?('PATCHED-DIARIO-PAN')
        src = src.gsub('#  define FMT_USE_CONSTEVAL 1',
                       '#  define FMT_USE_CONSTEVAL 0  // PATCHED-DIARIO-PAN')
        begin
          File.chmod(0644, fmt_base)
        rescue StandardError
        end
        File.write(fmt_base, src)
        Pod::UI.puts '[withFmtFix] Patched fmt base.h (consteval disabled)'
      end
    end
    # --- end fmt/consteval fix ---
`;

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfilePath, "utf8");

      // Only inject once, right after the post_install hook opens.
      if (!contents.includes("fmt/consteval fix")) {
        contents = contents.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|\n${RUBY_SNIPPET}`
        );
        fs.writeFileSync(podfilePath, contents);
      }
      return cfg;
    },
  ]);
};
