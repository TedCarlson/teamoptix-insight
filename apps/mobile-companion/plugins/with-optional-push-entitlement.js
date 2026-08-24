const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

module.exports = function withOptionalPushEntitlement(config) {
  const withCleanInfoPlist = withInfoPlist(config, (modConfig) => {
    // expo-location exposes optional motion APIs, but Mobile Companion does
    // not use them. Keep the production permission surface exact.
    delete modConfig.modResults.NSMotionUsageDescription;

    // Production traffic is HTTPS-only and the app does not browse the local
    // network. Preserve ATS while removing development-only exceptions.
    const appTransportSecurity = modConfig.modResults.NSAppTransportSecurity;
    if (appTransportSecurity && typeof appTransportSecurity === "object") {
      delete appTransportSecurity.NSAllowsLocalNetworking;
      if (Object.keys(appTransportSecurity).length === 0) {
        delete modConfig.modResults.NSAppTransportSecurity;
      }
    }
    delete modConfig.modResults.NSBonjourServices;
    delete modConfig.modResults.NSLocalNetworkUsageDescription;

    return modConfig;
  });

  return withEntitlementsPlist(withCleanInfoPlist, (modConfig) => {
    const remoteRegistrationEnabled =
      modConfig.extra?.notifications?.remoteRegistrationEnabled === true;

    if (!remoteRegistrationEnabled) {
      delete modConfig.modResults["aps-environment"];
    }

    return modConfig;
  });
};
