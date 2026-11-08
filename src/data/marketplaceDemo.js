// Données d'EXEMPLE pour l'aperçu de la marketplace H-Shopping / H-Commerce.
// Ce ne sont ni de vrais produits, ni de vrais vendeurs, ni de vrais prix :
// l'interface les marque "Exemple". Le vrai catalogue arrivera avec les
// premiers vendeurs partenaires (voir api.products pour la suite).

export const MP_CATEGORIES = [
  { key: "fashion", icon: "Shirt", fr: "Mode", en: "Fashion" },
  { key: "home", icon: "Home", fr: "Maison", en: "Home" },
  { key: "tech", icon: "Headphones", fr: "Électronique", en: "Electronics" },
  { key: "food", icon: "Apple", fr: "Alimentation", en: "Food" },
  { key: "craft", icon: "Palette", fr: "Artisanat", en: "Crafts" },
  { key: "beauty", icon: "Sparkles", fr: "Beauté", en: "Beauty" },
];

export const MP_STORES = [
  { id: "mode", cat: "fashion", fr: "Boutique Mode", en: "Fashion Boutique", c1: "#B2573C", c2: "#F2A58E", kind: "dress" },
  { id: "maison", cat: "home", fr: "Maison & Déco", en: "Home & Decor", c1: "#3E6B52", c2: "#A8D5B5", kind: "lamp" },
  { id: "tech", cat: "tech", fr: "Espace Tech", en: "Tech Corner", c1: "#3D5F94", c2: "#9DB9E6", kind: "headphones" },
  { id: "marche", cat: "food", fr: "Marché Frais", en: "Fresh Market", c1: "#B9763C", c2: "#F6C896", kind: "basket" },
  { id: "atelier", cat: "craft", fr: "Atelier des Artisans", en: "Artisans' Workshop", c1: "#6B4FA3", c2: "#C7B3F0", kind: "vase" },
  { id: "beaute", cat: "beauty", fr: "Beauté Naturelle", en: "Natural Beauty", c1: "#8A5A36", c2: "#E4B968", kind: "jar" },
];

// bg = dégradé doux derrière l'illustration ; price en dollars (exemple).
export const MP_PRODUCTS = [
  { id: "p1", cat: "fashion", store: "mode", kind: "dress", c1: "#B2573C", c2: "#F2C9B8", bg: ["#FBEDE6", "#F4D5C7"], price: 28, badge: "new", fr: "Robe en pagne", en: "Wax-print dress" },
  { id: "p2", cat: "fashion", store: "mode", kind: "shirt", c1: "#3D5F94", c2: "#9DB9E6", bg: ["#EAF0FA", "#D3E0F4"], price: 12, badge: null, fr: "T-shirt coton", en: "Cotton T-shirt" },
  { id: "p3", cat: "fashion", store: "mode", kind: "sneaker", c1: "#2F3A4A", c2: "#E4B968", bg: ["#EEF0F3", "#DADFE6"], price: 35, badge: "-15%", fr: "Baskets urbaines", en: "Urban sneakers" },
  { id: "p4", cat: "fashion", store: "mode", kind: "bag", c1: "#8A5A36", c2: "#E4B968", bg: ["#F7EBDD", "#EBD3B7"], price: 24, badge: null, fr: "Sac à main cuir", en: "Leather handbag" },
  { id: "p5", cat: "home", store: "maison", kind: "sofa", c1: "#3E6B52", c2: "#6FA386", bg: ["#E7F1EA", "#CFE3D6"], price: 240, badge: null, fr: "Canapé deux places", en: "Two-seater sofa" },
  { id: "p6", cat: "home", store: "maison", kind: "lamp", c1: "#F3E3C2", c2: "#6B4A33", bg: ["#FAF1DF", "#F1DEB6"], price: 18, badge: "new", fr: "Lampe de chevet", en: "Bedside lamp" },
  { id: "p7", cat: "tech", store: "tech", kind: "headphones", c1: "#1E1A17", c2: "#C89A3D", bg: ["#EDEAE6", "#D9D3CB"], price: 22, badge: null, fr: "Casque audio", en: "Headphones" },
  { id: "p8", cat: "tech", store: "tech", kind: "phone", c1: "#3D5F94", c2: "#E4B968", bg: ["#E9EFF9", "#CFDCF2"], price: 120, badge: "-15%", fr: "Smartphone 64 Go", en: "64 GB smartphone" },
  { id: "p9", cat: "food", store: "marche", kind: "basket", c1: "#B9763C", c2: "#8A5A36", bg: ["#FBEFDD", "#F5DAB5"], price: 15, badge: null, fr: "Panier de saison", en: "Seasonal basket" },
  { id: "p10", cat: "craft", store: "atelier", kind: "fabric", c1: "#2F7A5C", c2: "#E4B968", bg: ["#E6F2EC", "#CBE5D8"], price: 16, badge: "new", fr: "Tissu wax 6 yards", en: "Wax fabric, 6 yards" },
  { id: "p11", cat: "craft", store: "atelier", kind: "vase", c1: "#B2573C", c2: "#F2C9B8", bg: ["#FBEBE4", "#F3D2C4"], price: 14, badge: null, fr: "Vase en terre cuite", en: "Terracotta vase" },
  { id: "p12", cat: "beauty", store: "beaute", kind: "jar", c1: "#E4B968", c2: "#6B4A33", bg: ["#FAF1DD", "#F1DDB0"], price: 9, badge: null, fr: "Beurre de karité", en: "Shea butter" },
];
