import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import { Accelerometer } from 'expo-sensors';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';

const CAFE = { latitude: 32.6245, longitude: -115.4523 };
const RADIO_METROS = 150;
const SHAKE_UMBRAL = 1.8;

const MENU = [
  {
    id: 'latte-vainilla',
    nombre: 'Latte de Vainilla',
    precio: 55,
    imagen: require('./assets/Latte de vainilla.jpeg'),
    favorita: true,
  },
  {
    id: 'matcha-latte',
    nombre: 'Matcha Latte',
    precio: 65,
    imagen: require('./assets/Banana Matcha.jpeg'),
    favorita: false,
  },
  {
    id: 'capuchino',
    nombre: 'Capuchino',
    precio: 50,
    imagen: require('./assets/Latte de mocha.jpeg'),
    favorita: false,
  },
  {
    id: 'smoothie-oreo',
    nombre: 'Smoothie de Oreo',
    precio: 70,
    imagen: require('./assets/Smoothie de oreo.jpeg'),
    favorita: false,
  },
];

const FAVORITA = MENU[0];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function distancia(a, b) {
  const radioTierra = 6371000;
  const radianes = (grados) => (grados * Math.PI) / 180;
  const diferenciaLatitud = radianes(b.latitude - a.latitude);
  const diferenciaLongitud = radianes(b.longitude - a.longitude);
  const h =
    Math.sin(diferenciaLatitud / 2) ** 2 +
    Math.cos(radianes(a.latitude)) *
      Math.cos(radianes(b.latitude)) *
      Math.sin(diferenciaLongitud / 2) ** 2;

  return 2 * radioTierra * Math.asin(Math.sqrt(h));
}

export default function App() {
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [metros, setMetros] = useState(null);
  const [simularCerca, setSimularCerca] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('Agita tu iPhone para pedir tu favorita');
  const ultimoShake = useRef(0);

  const total = useMemo(
    () => carrito.reduce((suma, item) => suma + item.precio, 0),
    [carrito],
  );
  const cerca = simularCerca || (metros !== null && metros <= RADIO_METROS);

  const agregar = (item) => setCarrito((actual) => [...actual, item]);
  const agregarFavorita = () => {
    agregar(FAVORITA);
    setAviso(`¡Se agregó ${FAVORITA.nombre} a tu carrito!`);
  };

  useEffect(() => {
    Accelerometer.setUpdateInterval(120);
    const suscripcion = Accelerometer.addListener(({ x, y, z }) => {
      const fuerza = Math.sqrt(x * x + y * y + z * z);
      const ahora = Date.now();

      if (fuerza > SHAKE_UMBRAL && ahora - ultimoShake.current > 1500) {
        ultimoShake.current = ahora;
        agregarFavorita();
      }
    });

    return () => suscripcion.remove();
  }, []);

  useEffect(() => {
    const registrarNotificacionesPush = async () => {
      if (!Device.isDevice) {
        console.warn('Las notificaciones push requieren un dispositivo físico.');
        return;
      }

      try {
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          ({ status } = await Notifications.requestPermissionsAsync());
        }

        if (status !== 'granted') {
          console.warn('No se otorgó permiso para las notificaciones push.');
          return;
        }

        const token = await Notifications.getExpoPushTokenAsync({
          projectId:
            Constants.expoConfig?.extra?.eas?.projectId ??
            Constants.easConfig?.projectId,
        });
        setExpoPushToken(token.data);
        console.log('Expo push token:', token.data);
      } catch (error) {
        console.error('No se pudo registrar el token push:', error);
      }
    };

    registrarNotificacionesPush();
  }, []);

  const obtenerUbicacion = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ubicación', 'Activa el permiso o usa el modo demo.');
      return;
    }

    const posicion = await Location.getCurrentPositionAsync({});
    setMetros(Math.round(distancia(posicion.coords, CAFE)));
  };

  const confirmarYPagar = async () => {
    if (carrito.length === 0) {
      Alert.alert('Carrito vacío', 'Agrega una bebida primero.');
      return;
    }

    setCargando(true);
    try {
      const autenticacion = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirma tu pago con Face ID',
        cancelLabel: 'Cancelar',
      });
      if (!autenticacion.success) {
        setAviso('Pago cancelado: no se validó tu identidad');
        return;
      }

      await addDoc(collection(db, 'pedidos'), {
        articulo: carrito.map((item) => item.nombre).join(', '),
        total,
        estado: 'pendiente',
        creadoEn: serverTimestamp(),
      });

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Cuatro Hojas',
          body: '¡Tu bebida de Cuatro Hojas está lista en la barra!',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
        },
      });

      setCarrito([]);
      setAviso('Pedido enviado. Te avisamos en 5 segundos.');
      Alert.alert('¡Pago exitoso!', 'Tu pedido quedó como pendiente.');
    } catch (error) {
      Alert.alert('Error', String(error?.message || error));
    } finally {
      setCargando(false);
    }
  };

  const textoUbicacion = simularCerca
    ? 'Modo demo: estás en el estacionamiento'
    : metros === null
      ? 'Aún no sabemos dónde estás'
      : `Estás a ${metros} m de la cafetería`;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Image
          source={require('./assets/MASCOTA BIENVENIDA.jpeg')}
          style={styles.mascotaBienvenida}
          resizeMode="cover"
          accessibilityLabel="Mascota de Cuatro Hojas"
        />

        <View style={styles.marca}>
          <View style={styles.tituloMarca}>
            <Ionicons name="leaf" size={21} color="#7BC67E" />
            <Text style={styles.nombreMarca}>Cuatro Hojas</Text>
          </View>
          <Text style={styles.subtituloMarca}>Pedido exprés · Drive-Thru</Text>
        </View>

        <Pressable
          style={styles.botonAjustes}
          onPress={() => Alert.alert('Ajustes', 'Configuración de Cuatro Hojas')}
          accessibilityRole="button"
          accessibilityLabel="Ajustes"
        >
          <Ionicons name="settings-outline" size={23} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.cuerpo}>
        <ScrollView
          contentContainerStyle={styles.contenido}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={({ pressed }) => [
              styles.banner,
              pressed && styles.bannerPresionado,
            ]}
            onPress={agregarFavorita}
            accessibilityRole="button"
          >
            <Ionicons name="phone-portrait-outline" size={18} color="#49320C" />
            <Text style={styles.textoBanner}>{aviso}</Text>
          </Pressable>

          <Text style={styles.tituloSeccion}>Menú</Text>
          {MENU.map((item) => (
            <View key={item.id} style={styles.tarjetaProducto}>
              <Image
                source={item.imagen}
                style={styles.imagenProducto}
                resizeMode="cover"
                accessibilityLabel={item.nombre}
              />

              <View style={styles.detalleProducto}>
                <Text style={styles.nombreProducto} numberOfLines={2}>
                  {item.nombre}
                </Text>
                {item.favorita && (
                  <View style={styles.etiquetaFavorita}>
                    <Ionicons name="star" size={12} color="#F5A623" />
                    <Text style={styles.textoFavorita}>favorita</Text>
                  </View>
                )}
                <Text style={styles.precioProducto}>${item.precio}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.botonAgregar,
                  pressed && styles.botonPresionado,
                ]}
                onPress={() => agregar(item)}
                accessibilityRole="button"
                accessibilityLabel={`Agregar ${item.nombre} al carrito`}
              >
                <Text style={styles.textoBotonAgregar}>Agregar</Text>
              </Pressable>
            </View>
          ))}

          <Text style={styles.tituloSeccion}>Tu carrito</Text>
          <View style={styles.tarjetaCarrito}>
            <View style={styles.detalleCarrito}>
              {carrito.length === 0 ? (
                <Text style={styles.textoVacio}>
                  Aún no hay bebidas. Agrega una o agita el teléfono.
                </Text>
              ) : (
                <View style={styles.listaCarrito}>
                  {carrito.map((item, indice) => (
                    <Text key={`${item.id}-${indice}`} style={styles.itemCarrito}>
                      {item.nombre} · ${item.precio}
                    </Text>
                  ))}
                </View>
              )}
              <Text style={styles.total}>Total: ${total}</Text>
            </View>
            <Image
              source={require('./assets/MASCOTA ESPERANDO.jpeg')}
              style={styles.mascotaCarrito}
              resizeMode="contain"
              accessibilityLabel="Mascota esperando tu pedido"
            />
          </View>

          <Text style={styles.tituloSeccion}>Ubicación</Text>
          <View style={styles.tarjetaUbicacion}>
            <Text style={styles.textoUbicacion}>{textoUbicacion}</Text>
            <Pressable
              style={styles.botonMapa}
              onPress={obtenerUbicacion}
              accessibilityRole="button"
              accessibilityLabel="Consultar ubicación"
            >
              <Ionicons name="map-outline" size={26} color="#1E5631" />
            </Pressable>
          </View>
          <View style={styles.accionesUbicacion}>
            <Pressable
              style={styles.botonUbicacion}
              onPress={obtenerUbicacion}
              accessibilityRole="button"
            >
              <Text style={styles.textoBotonUbicacion}>Obtener ubicación</Text>
            </Pressable>
            <Pressable
              style={[
                styles.botonUbicacion,
                simularCerca && styles.botonSimulacionActiva,
              ]}
              onPress={() => setSimularCerca((activa) => !activa)}
              accessibilityRole="button"
              accessibilityLabel={
                simularCerca ? 'Desactivar simulación de llegada' : 'Simular llegada'
              }
            >
              <Text
                style={[
                  styles.textoBotonUbicacion,
                  simularCerca && styles.textoSimulacionActiva,
                ]}
              >
                {simularCerca ? 'Quitar simulación' : 'Simular llegada'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={[
              styles.botonPagar,
              (!cerca || cargando) && styles.botonDeshabilitado,
            ]}
            disabled={!cerca || cargando}
            onPress={confirmarYPagar}
            accessibilityRole="button"
          >
            <Text style={styles.textoBotonPagar}>
              {cargando ? 'Procesando…' : 'Confirmar llegada y pagar'}
            </Text>
          </Pressable>
          {!cerca && (
            <Text style={styles.notaPago}>
              Acércate a la cafetería para pagar.
            </Text>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B3C2A',
  },
  header: {
    minHeight: 112,
    backgroundColor: '#0B3C2A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  mascotaBienvenida: {
    width: 58,
    height: 58,
    borderRadius: 18,
    marginRight: 12,
  },
  marca: {
    flex: 1,
  },
  tituloMarca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  nombreMarca: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  subtituloMarca: {
    color: '#A8C3B4',
    fontSize: 13,
    marginTop: 4,
  },
  botonAjustes: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E88E5',
    borderWidth: 2,
    borderColor: '#0B3C2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  cuerpo: {
    flex: 1,
    backgroundColor: '#EAF2EB',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  contenido: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
  },
  banner: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5A623',
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 9,
    marginBottom: 8,
  },
  bannerPresionado: {
    opacity: 0.85,
  },
  textoBanner: {
    flexShrink: 1,
    color: '#49320C',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  tituloSeccion: {
    color: '#0B3C2A',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 17,
    marginBottom: 10,
  },
  tarjetaProducto: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#173D29',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
    elevation: 2,
  },
  imagenProducto: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#EAF2EB',
  },
  detalleProducto: {
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  nombreProducto: {
    color: '#183D2C',
    fontSize: 15,
    fontWeight: '700',
  },
  etiquetaFavorita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  textoFavorita: {
    color: '#A66A0A',
    fontSize: 11,
    fontWeight: '600',
  },
  precioProducto: {
    color: '#526258',
    fontSize: 14,
    marginTop: 3,
  },
  botonAgregar: {
    backgroundColor: '#1E5631',
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonPresionado: {
    opacity: 0.82,
  },
  textoBotonAgregar: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tarjetaCarrito: {
    minHeight: 142,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4E8D6',
    borderRadius: 18,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  detalleCarrito: {
    flex: 1,
  },
  textoVacio: {
    color: '#62665F',
    fontSize: 14,
    lineHeight: 20,
  },
  listaCarrito: {
    maxHeight: 94,
  },
  itemCarrito: {
    color: '#424B43',
    fontSize: 13,
    marginBottom: 3,
  },
  total: {
    color: '#111111',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 9,
  },
  mascotaCarrito: {
    width: 104,
    height: 118,
    marginLeft: 8,
  },
  tarjetaUbicacion: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 12,
    shadowColor: '#173D29',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  textoUbicacion: {
    flex: 1,
    color: '#4A584E',
    fontSize: 15,
  },
  botonMapa: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accionesUbicacion: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  botonUbicacion: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#1E5631',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  botonSimulacionActiva: {
    backgroundColor: '#1E5631',
  },
  textoBotonUbicacion: {
    color: '#1E5631',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  textoSimulacionActiva: {
    color: '#FFFFFF',
  },
  botonPagar: {
    minHeight: 52,
    backgroundColor: '#1E5631',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 16,
  },
  botonDeshabilitado: {
    backgroundColor: '#9AAC9E',
  },
  textoBotonPagar: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  notaPago: {
    color: '#526258',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 8,
  },
});
