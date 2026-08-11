const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withOptionalPushEntitlement(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    const remoteRegistrationEnabled =
      modConfig.extra?.notifications?.remoteRegistrationEnabled === true;

    if (!remoteRegistrationEnabled) {
      delete modConfig.modResults["aps-environment"];
    }

    return modConfig;
  });
};
