import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateAddress } from "../src/services/ssrfGuard.js";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("assertPublicHttpUrl", () => {
  const publicResolver = async () => ["93.184.216.34"];

  it("rejects non-http schemes", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd", publicResolver)).rejects.toThrow(/http/);
    await expect(assertPublicHttpUrl("ftp://example.com", publicResolver)).rejects.toThrow(/http/);
  });
  it("rejects garbage", async () => {
    await expect(assertPublicHttpUrl("not a url", publicResolver)).rejects.toThrow(/valid URL/);
  });
  it("rejects hosts that resolve to private addresses (e.g. DNS pointing at localhost)", async () => {
    await expect(assertPublicHttpUrl("http://evil.example", async () => ["127.0.0.1"])).rejects.toThrow(/private/);
  });
  it("rejects if any resolved address is private", async () => {
    await expect(assertPublicHttpUrl("http://mixed.example", async () => ["93.184.216.34", "10.0.0.5"])).rejects.toThrow(/private/);
  });
  it("rejects IP literals", async () => {
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/private/);
    await expect(assertPublicHttpUrl("http://[::1]:3000/")).rejects.toThrow(/private/);
  });
  it("accepts public hosts", async () => {
    const url = await assertPublicHttpUrl("https://example.com/page", publicResolver);
    expect(url.hostname).toBe("example.com");
  });
});
