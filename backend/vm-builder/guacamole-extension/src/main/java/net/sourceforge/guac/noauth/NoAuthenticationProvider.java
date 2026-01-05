package net.sourceforge.guac.noauth;

import org.apache.guacamole.GuacamoleException;
import org.apache.guacamole.net.auth.simple.SimpleAuthenticationProvider;
import org.apache.guacamole.net.auth.Credentials;
import org.apache.guacamole.protocol.GuacamoleConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import java.io.File;
import java.util.HashMap;
import java.util.Map;

/**
 * No-Authentication provider that returns all configured connections
 * without requiring any authentication. All connections are available
 * to all users.
 */
public class NoAuthenticationProvider extends SimpleAuthenticationProvider {

    private static final Logger logger = LoggerFactory.getLogger(NoAuthenticationProvider.class);
    
    private static final String NOAUTH_CONFIG_PATH = "/etc/guacamole/noauth-config.xml";

    @Override
    public String getIdentifier() {
        return "noauth";
    }

    @Override
    public Map<String, GuacamoleConfiguration> getAuthorizedConfigurations(Credentials credentials)
            throws GuacamoleException {
        
        Map<String, GuacamoleConfiguration> configs = new HashMap<>();
        
        try {
            File configFile = new File(NOAUTH_CONFIG_PATH);
            if (!configFile.exists()) {
                logger.warn("NoAuth config file not found: {}", NOAUTH_CONFIG_PATH);
                return configs;
            }

            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(configFile);
            doc.getDocumentElement().normalize();

            NodeList configNodes = doc.getElementsByTagName("config");
            logger.info("Loading {} connection(s) from NoAuth configuration", configNodes.getLength());

            for (int i = 0; i < configNodes.getLength(); i++) {
                Element configElement = (Element) configNodes.item(i);
                
                String name = configElement.getAttribute("name");
                String protocol = configElement.getAttribute("protocol");
                
                if (name == null || name.isEmpty()) {
                    logger.warn("Skipping config without name attribute");
                    continue;
                }
                
                if (protocol == null || protocol.isEmpty()) {
                    logger.warn("Skipping config '{}' without protocol attribute", name);
                    continue;
                }

                GuacamoleConfiguration config = new GuacamoleConfiguration();
                config.setProtocol(protocol);

                // Parse all param elements
                NodeList params = configElement.getElementsByTagName("param");
                for (int j = 0; j < params.getLength(); j++) {
                    Element param = (Element) params.item(j);
                    String paramName = param.getAttribute("name");
                    String paramValue = param.getAttribute("value");
                    
                    if (paramName != null && !paramName.isEmpty()) {
                        // Support environment variable substitution ${VAR_NAME}
                        if (paramValue != null && paramValue.contains("${")) {
                            paramValue = replaceEnvVariables(paramValue);
                        }
                        config.setParameter(paramName, paramValue);
                    }
                }

                configs.put(name, config);
                logger.debug("Loaded connection: {} ({})", name, protocol);
            }

            logger.info("NoAuth provider initialized with {} connection(s)", configs.size());
            
        } catch (Exception e) {
            logger.error("Error loading NoAuth configuration", e);
            throw new GuacamoleException("Failed to load NoAuth configuration", e);
        }

        return configs;
    }

    /**
     * Replace environment variable placeholders ${VAR_NAME} with actual values
     */
    private String replaceEnvVariables(String value) {
        if (value == null) return null;
        
        int start = value.indexOf("${");
        while (start != -1) {
            int end = value.indexOf("}", start);
            if (end == -1) break;
            
            String varName = value.substring(start + 2, end);
            String varValue = System.getenv(varName);
            
            if (varValue != null) {
                value = value.substring(0, start) + varValue + value.substring(end + 1);
            } else {
                logger.warn("Environment variable not found: {}", varName);
            }
            
            start = value.indexOf("${", start + 1);
        }
        
        return value;
    }
}

