/**
 * NetworkingSelector - small OOP helper to select service networking mode
 *
 * Responsibilities:
 * - Decide whether to use bridge/TAP networking or fall back to user-mode
 * - Emit actionable warnings (caller decides how to surface them)
 *
 * KISS: no side effects besides pushing to provided warnings array.
 */

class NetworkingSelector {
  /**
   * @param {object} args
   * @param {string} args.serviceName
   * @param {string|null} args.requestedNetworkName - Name of environment network requested by service (e.g. "internal")
   * @param {object} args.networkConfigs - Map of networkName -> { bridge_name, subnet, isolated }
   * @param {function} args.createTap - async function that returns tap interface name (string)
   * @param {string[]} args.warnings - mutable array to append warnings to
   * @returns {{ networkConfig: object|null, effectiveMode: 'tap'|'user' }}
   */
  async selectServiceNetworking({ serviceName, requestedNetworkName, networkConfigs, createTap, warnings }) {
    const warn = (msg) => {
      if (Array.isArray(warnings)) warnings.push(String(msg));
    };

    if (!requestedNetworkName) {
      return { networkConfig: null, effectiveMode: 'user' };
    }

    const net = networkConfigs && networkConfigs[requestedNetworkName];
    if (!net || !net.bridge_name) {
      warn(
        `Service "${serviceName}" requested network "${requestedNetworkName}", ` +
        `but it was not created/available. Falling back to user-mode networking.`
      );
      return { networkConfig: null, effectiveMode: 'user' };
    }

    // Try to create/attach TAP. If that fails, fall back to user-mode.
    try {
      // NOTE: createTap may throw; we intentionally catch and convert into a warning.
      const tapActual = await createTap();
      return {
        networkConfig: { bridge_name: net.bridge_name, tap_name: tapActual, subnet: net.subnet },
        effectiveMode: 'tap'
      };
    } catch (e) {
      const err = e && e.message ? e.message : String(e);
      warn(
        `Could not create TAP for service "${serviceName}" on network "${requestedNetworkName}". ` +
        `Falling back to user-mode networking. Error: ${err}`
      );
      return { networkConfig: null, effectiveMode: 'user' };
    }
  }
}

module.exports = { NetworkingSelector };


