import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PickedImage = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

export type PickImageOptions = {
  /** Recadrage natif. Par défaut : activé, format portrait. */
  allowsEditing?: boolean;
  aspect?: [number, number];
};

/**
 * Demande la permission puis ouvre la caméra ou la galerie système.
 * Pas de sélecteur custom — UI native uniquement.
 */
export async function pickImageFromDevice(
  source: 'camera' | 'library',
  pickOptions?: PickImageOptions,
): Promise<PickedImage | null> {
  if (source === 'camera') {
    const current = await ImagePicker.getCameraPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const asked = await ImagePicker.requestCameraPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') {
      Alert.alert(
        'Caméra',
        'Autorisez l’accès à la caméra dans les réglages pour photographier.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Réglages', onPress: () => void Linking.openSettings() },
        ],
      );
      return null;
    }
  } else {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') {
      Alert.alert(
        'Photos',
        'Autorisez l’accès à la galerie dans les réglages pour choisir une image.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Réglages', onPress: () => void Linking.openSettings() },
        ],
      );
      return null;
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: pickOptions?.allowsEditing ?? true,
    aspect: pickOptions?.aspect ?? [3, 4],
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
  };
}

/** Propose Caméra ou Galerie, puis lance le flux avec permission. */
export function promptPickImage(
  onPicked: (image: PickedImage) => void,
  pickOptions?: PickImageOptions,
): void {
  Alert.alert('Photo', 'Choisir la source', [
    {
      text: 'Caméra',
      onPress: () => {
        void (async () => {
          const img = await pickImageFromDevice('camera', pickOptions);
          if (img) onPicked(img);
        })();
      },
    },
    {
      text: 'Galerie',
      onPress: () => {
        void (async () => {
          const img = await pickImageFromDevice('library', pickOptions);
          if (img) onPicked(img);
        })();
      },
    },
    { text: 'Annuler', style: 'cancel' },
  ]);
}
