import type { CapacitorConfig } from "@capacitor/cli";

const developmentServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();

if (developmentServerUrl) {
  const parsed = new URL(developmentServerUrl);
  const isSecure = parsed.protocol === "https:";
  const isLocalDevelopment = parsed.protocol === "http:" && (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "10.0.2.2" ||
    parsed.hostname.startsWith("192.168.") ||
    parsed.hostname.startsWith("10.")
  );

  if (!isSecure && !isLocalDevelopment) {
    throw new Error("CAPACITOR_SERVER_URL must use HTTPS, except for a local development address.");
  }
}

const config: CapacitorConfig = {
  appId: "ir.wealthos.personalagent",
  appName: "همراه",
  webDir: "mobile-shell",
  backgroundColor: "#F7F7FF",
  loggingBehavior: developmentServerUrl ? "debug" : "production",
  android: {
    backgroundColor: "#F7F7FF",
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_hamrah",
      iconColor: "#5C70B4",
    },
  },
  ...(developmentServerUrl ? {
    server: {
      url: developmentServerUrl,
      cleartext: developmentServerUrl.startsWith("http://"),
      errorPath: "connection-error.html",
    },
  } : {}),
};

export default config;
