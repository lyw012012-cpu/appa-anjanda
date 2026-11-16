import { StyleSheet, Text, View } from 'react-native';

// 첫 화면 자리. 알람 화면은 이슈 I-8에서 만든다.
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text>아빠 안잔다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
