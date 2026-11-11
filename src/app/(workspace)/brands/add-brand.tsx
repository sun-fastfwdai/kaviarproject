"use client";
import { useActionState } from "react";
import { createBrand, type BrandFormState } from "./actions";

export function AddBrand() {
  const [state, action, pending] = useActionState<BrandFormState, FormData>(createBrand, undefined);
  return (
    <details style={{ position: "relative" }}>
      <summary className="btn dark sm">+ Add brand</summary>
      <form
        action={action}
        className="card col g12"
        style={{ position: "absolute", right: 0, top: 36, width: 320, padding: 16, zIndex: 10, boxShadow: "0 16px 40px rgba(18,18,18,0.14)" }}
      >
        <span className="h3">New brand</span>
        <label className="col g6"><span className="label">Name</span><div className="input sm"><input name="name" placeholder="Jmella" required autoFocus /></div></label>
        <label className="col g6"><span className="label">Category <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span><div className="input sm"><input name="category" placeholder="Fragrance & body care" /></div></label>
        {state?.error && <div className="notice red">{state.error}</div>}
        <button className="btn dark" disabled={pending}>{pending ? "Creating…" : "Create and connect Shopify"}</button>
      </form>
    </details>
  );
}
