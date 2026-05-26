export interface Appointment {
  id?: string;
  name: string;
  phone: string;
  serviceType: string;
  barberId: string;
  barberName: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: any; // ServerTimestamp
  price?: number;
  serviceId?: string;
}

export interface Barber {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'barber';
  photo?: string;
}

export interface Service {
  name: string;
  price: string;
  description: string;
}

export interface Testimonial {
  name: string;
  text: string;
  role: string;
}
