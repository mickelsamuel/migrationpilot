class Migrationpilot < Formula
  desc "Block unsafe Postgres migrations before merge"
  homepage "https://migrationpilot.dev"
  url "https://registry.npmjs.org/migrationpilot/-/migrationpilot-1.6.3.tgz"
  sha256 "ceb6e421d9f25fb6d44ef71b0b99f9a1df8428f72b5c98ad22d4a603602e3554"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/migrationpilot --version")

    (testpath/"safe.sql").write <<~SQL
      SET lock_timeout = '5s';
      ALTER TABLE users ADD COLUMN nickname text;
      RESET lock_timeout;
    SQL
    system bin/"migrationpilot", "analyze", testpath/"safe.sql", "--quiet"

    (testpath/"unsafe.sql").write "ALTER TABLE users ADD COLUMN email text NOT NULL;\n"
    # Exit status 2 is the documented result for a critical violation.
    output = shell_output("#{bin}/migrationpilot analyze #{testpath}/unsafe.sql --quiet", 2)
    assert_match "MP004", output
  end
end
