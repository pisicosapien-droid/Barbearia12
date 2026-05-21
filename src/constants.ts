import { Service, Testimonial } from "./types";

export const BARBERSHOP_DATA = {
  name: "Barbearia D'Biazzi",
  title: "Barbearia D'Biazzi",
  slogan: "Seu estilo no seu estilo!",
  about: "Desde 2015 trazendo qualidade nos serviços prestados e um atendimento diferenciado. A Barbearia D'Biazzi teve início na sala de casa, onde por algum tempo realizamos os atendimentos de nossos clientes. Após a grande procura, em Maio de 2017, mudamos de endereço para um novo espaço maior, mais aconchegante e agradável, contando com mais profissionais barbeiros para atender melhor nossos amigos e clientes.",
  phone: "11974314484",
  phoneDisplay: "(11) 97431-4484",
  email: "murilobiazi@outlook.com",
  address: "Rua Bom Jesus de Pirapora, 2523 - Vila Rami, Jundiaí - SP",
  zipCode: "13206-305",
  instagram: "barbeariadbiazzi",
  facebook: "barbeariadbiazzi",
  mapsEmbed: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3663.8569429446387!2d-46.88414452504825!3d-23.211831348810243!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94cf269784196147%3A0xe5a14f494a86b1f!2sBarbearia%20D'Biazzi!5e0!3m2!1spt-BR!2sbr!4v1716060000000!5m2!1spt-BR!2sbr",
  logoUrl: "",
  dragLogoUrl: ""
};

export const SERVICES: Service[] = [
  { name: "Corte de cabelo", price: "R$ 40,00", description: "Corte clássico ou moderno com acabamento refinado." },
  { name: "Designer de Barba", price: "R$ 35,00", description: "Modelagem de barba com toalha quente e navalha." },
  { name: "Combo Cabelo & Barba", price: "R$ 60,00", description: "Pacote completo para renovar seu visual." },
  { name: "Barboterapia", price: "R$ 45,00", description: "Tratamento relaxante para a pele e fios da barba." },
  { name: "Sobrancelha (navalha)", price: "R$ 10,00", description: "Limpeza e design de sobrancelhas na navalha." },
  { name: "Alisamento", price: "R$ 30,00", description: "Redução de volume e alinhamento dos fios." }
];

export const TESTIMONIALS: Testimonial[] = [
  { name: "Diego Z. B.", role: "Cliente", text: "Barber Shop moderno, alegre... movimentado... profissionais detalhistas e capacitados." },
  { name: "Leite T.", role: "Cliente", text: "Barbearia SENSACIONAL super indico, profissionais muito bem formados e cortes refinados. 👍💈✂️" },
  { name: "Douglas R.", role: "Cliente", text: "Nunca cortei cabelo em uma barbearia tão boa. Ótimo astral." },
  { name: "Henilton G.", role: "Cliente", text: "Ótimo ambiente e atendimento top... Melhor barbearia da região e sempre com um preço muito justo." }
];

export const OPENING_HOURS = [
  { day: "Terça a Sexta", hours: "09h às 19h" },
  { day: "Sábado", hours: "09h às 16h" },
  { day: "Segunda e Domingo", hours: "Fechado" }
];

export const AUTHORIZED_EMAILS = [
  "pisicosapien@gmail.com",
  "psicosapiens@gmail.com",
  "murilobiazi@outlook.com"
];

export const GALLERY_IMAGES = [
  "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?q=80&w=2074&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1621605815841-28d944683b99?q=80&w=2070&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=2070&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1599351432247-f033109be995?q=80&w=1974&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1512690196252-74702f357065?q=80&w=1974&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=2070&auto=format&fit=crop"
];
