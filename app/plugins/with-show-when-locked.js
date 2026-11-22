// 알람이 울릴 때 앱 화면(MainActivity)이 잠금 화면 위로 켜지게 한다.
// react-native-alarm-scheduler의 fullScreenTarget: 'app'은 이 설정이 있어야 잠금 화면 뒤가 아니라 위에 열린다
// (라이브러리 문서 platforms/android "The ringing surface").
// ponytail: 앱 화면 전체에 켜진다(잠금 상태에서 앱이 열리면 늘 위로 뜸). 알람 때만 켜려면 네이티브 모듈에서 setShowWhenLocked를 런타임에 부른다.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withShowWhenLocked(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('with-show-when-locked: MainActivity를 찾지 못함');
    main.$['android:showWhenLocked'] = 'true';
    main.$['android:turnScreenOn'] = 'true';
    return cfg;
  });
};
