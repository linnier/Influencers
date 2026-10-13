export default {
  output: "standalone",
  serverExternalPackages: ["node:sqlite", "exceljs"],
  experimental: { cpus: 2 },
};
