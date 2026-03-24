import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareRecapDialog } from "./ShareRecapDialog";

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  accountId: 1,
  gameweek: 7,
  teamName: "Midnight Press FC",
};

describe("ShareRecapDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom does not implement navigator.canShare or ClipboardItem
    if ("canShare" in navigator) {
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    }
    // Remove ClipboardItem if present
    if ("ClipboardItem" in window) {
      Object.defineProperty(window, "ClipboardItem", { value: undefined, configurable: true });
    }
  });

  it("renders the preview image with the correct src", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    const img = screen.getByRole("img", { name: /GW7 Recap Card/i });
    expect(img).toHaveAttribute("src", "/api/my-team/1/recap/7");
  });

  it("renders X, WhatsApp, Telegram buttons that open /preview deep-link URLs", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const xBtn = screen.getByRole("button", { name: /post to x/i });
    fireEvent.click(xBtn);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("twitter.com/intent/tweet"),
      "_blank",
      "noreferrer",
    );
    // Deep-link should encode the /preview URL, not the raw PNG
    // The preview path is URL-encoded inside the query string, so decode before asserting
    const xCall = decodeURIComponent(openSpy.mock.calls[0][0] as string);
    expect(xCall).toContain("/recap/7/preview");
    openSpy.mockClear();

    const waBtn = screen.getByRole("button", { name: /send on whatsapp/i });
    fireEvent.click(waBtn);
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("wa.me"), "_blank", "noreferrer");
    const waCall = decodeURIComponent(openSpy.mock.calls[0][0] as string);
    expect(waCall).toContain("/recap/7/preview");
    openSpy.mockClear();

    const tgBtn = screen.getByRole("button", { name: /send on telegram/i });
    fireEvent.click(tgBtn);
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("t.me/share/url"), "_blank", "noreferrer");
    const tgCall = decodeURIComponent(openSpy.mock.calls[0][0] as string);
    expect(tgCall).toContain("/recap/7/preview");
  });

  it("does not render the Share image button when navigator.canShare is unavailable (jsdom)", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    expect(screen.queryByRole("button", { name: /share image/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/instagram/i)).not.toBeInTheDocument();
  });

  it("shows 'Copy link' label and calls clipboard.writeText when ClipboardItem is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    // Ensure fetch returns a blob
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["img"], { type: "image/png" }) }));

    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    const copyBtn = screen.getByRole("button", { name: /copy link/i });
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/api/my-team/1/recap/7"));
    });
    expect(await screen.findByRole("button", { name: /copied!/i })).toBeInTheDocument();
  });

  it("shows 'Copy image' label and calls clipboard.write with ClipboardItem when available", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { write },
      configurable: true,
    });
    // Stub ClipboardItem as a constructor
    const ClipboardItemStub = vi.fn().mockImplementation((data: Record<string, Blob>) => data);
    Object.defineProperty(window, "ClipboardItem", { value: ClipboardItemStub, configurable: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["img"], { type: "image/png" }) }));

    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    const copyBtn = screen.getByRole("button", { name: /copy image/i });
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(write).toHaveBeenCalled();
    });
    expect(await screen.findByRole("button", { name: /copied!/i })).toBeInTheDocument();
  });

  it("renders a download link with correct href and download attribute", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    const downloadLink = screen.getByRole("link", { name: /save image/i });
    expect(downloadLink).toHaveAttribute("href", "/api/my-team/1/recap/7");
    expect(downloadLink).toHaveAttribute("download", "fplytics-gw7-recap.png");
  });

  it("calls onOpenChange(false) when the dialog close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(<ShareRecapDialog {...DEFAULT_PROPS} onOpenChange={onOpenChange} />);
    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the team name as the dialog description", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText("Midnight Press FC")).toBeInTheDocument();
  });
});
