const fallbackImage = '/landingpage/hero-dashboard.jpg';
const heroBanner = fallbackImage;
const categoryBlusas = fallbackImage;
const categoryConjuntos = fallbackImage;
const categoryMangaLonga = fallbackImage;
const product1 = fallbackImage;
const product2 = fallbackImage;
const product3 = fallbackImage;
const product4 = fallbackImage;
const product5 = fallbackImage;
const product6 = fallbackImage;
const productDetail2 = fallbackImage;
const productDetail3 = fallbackImage;
const productDetail4 = fallbackImage;

export const modernoMockHeroBanner = heroBanner;

export const modernoMockCategories = [
  { name: 'Blusas', image: categoryBlusas, count: '48 pecas' },
  { name: 'Conjuntos', image: categoryConjuntos, count: '32 pecas' },
  { name: 'Manga Longa', image: categoryMangaLonga, count: '26 pecas' },
];

export const modernoMockNewArrivals = [
  { id: '1', image: product1, name: 'Blusa Cetim Rose Manga Bufante', price: 159.9, colors: ['#d4a6a0', '#f5e6d3', '#c4a882'], isNew: true },
  { id: '2', image: product2, name: 'Vestido Midi Caramelo Transpassado', price: 229.9, originalPrice: 289.9, colors: ['#a0724e', '#2d2420'], isNew: true },
  { id: '3', image: product3, name: 'Blusa Off-White Renda Delicada', price: 139.9, colors: ['#f5f0ea', '#d4a6a0'], isNew: true },
  { id: '4', image: product4, name: 'Conjunto Alfaiataria Bege Premium', price: 349.9, colors: ['#d4c4a8', '#2d2420', '#f5f0ea'], isNew: true },
];

export const modernoMockBestSellers = [
  { id: '5', image: product5, name: 'Blusa Manga Longa Rose Nude Decote V', price: 129.9, colors: ['#d4a6a0', '#f5e6d3'] },
  { id: '6', image: product6, name: 'Calca Wide Leg Linho Premium', price: 199.9, originalPrice: 249.9, colors: ['#d4c4a8', '#f5f0ea', '#2d2420'] },
  { id: '7', image: product1, name: 'Blusa Cetim Rose Classic', price: 149.9, colors: ['#d4a6a0'] },
  { id: '8', image: product2, name: 'Vestido Midi Chocolate Elegante', price: 219.9, colors: ['#a0724e', '#d4c4a8'] },
];

export const modernoMockProduct = {
  name: 'Blusa Cetim Rose Manga Bufante',
  price: 159.9,
  originalPrice: 199.9,
  sku: 'NB-BLS-0247',
  description:
    'A Blusa Cetim Rose Manga Bufante e a peca perfeita para compor looks sofisticados e femininos. Confeccionada em cetim premium com toque sedoso.',
  details: [
    'Tecido: Cetim premium com toque sedoso',
    'Composicao: 95% Poliester, 5% Elastano',
    'Manga bufante com punho elastico',
    'Decote V com acabamento delicado',
    'Modelagem regular',
  ],
  colors: [
    { name: 'Rose', hex: '#d4a6a0' },
    { name: 'Off-White', hex: '#f5f0ea' },
    { name: 'Caramelo', hex: '#c4a882' },
  ],
  sizes: ['PP', 'P', 'M', 'G', 'GG'],
  images: [product1, productDetail2, productDetail3, productDetail4],
};
