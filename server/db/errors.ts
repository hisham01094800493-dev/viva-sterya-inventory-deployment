export class InventoryError extends Error {
  constructor(
    public readonly kind:
      | "NOT_FOUND"
      | "CONFLICT"
      | "BAD_REQUEST"
      | "UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "InventoryError";
  }
}
