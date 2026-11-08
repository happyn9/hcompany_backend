import { mem } from "../lib/memStore.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { cartAdd, cartCount, cartRemove, cartSetQty, cartSubtotal, sanitizeCart } from "../lib/shop.js";

// Le panier vit sur l'appareil (en mémoire de l'onglet : rien n'est écrit dans le navigateur) : il n'exige
// pas de compte pour parcourir et remplir. Le serveur recalcule prix et
// stock à chaque devis, donc rien de ce qui est stocké ici n'est « cru ».
const KEY = "hc_shop_cart_v1";
const CartContext = createContext(null);

function load() {
  return sanitizeCart(mem.get(KEY, []));
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => { mem.set(KEY, items); }, [items]);

  // Synchronise plusieurs onglets ouverts en même temps.
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setItems(load());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((line) => setItems((cur) => cartAdd(cur, line)), []);
  const setQty = useCallback((key, qty) => setItems((cur) => cartSetQty(cur, key, qty)), []);
  const remove = useCallback((key) => setItems((cur) => cartRemove(cur, key)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, count: cartCount(items), subtotal: cartSubtotal(items), add, setQty, remove, clear }),
    [items, add, setQty, remove, clear]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans <CartProvider>");
  return ctx;
}
