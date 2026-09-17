package ir.wealthos.personalagent;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.capacitorjs.plugins.localnotifications.TiaAlarmChannels;
import org.junit.Test;

public class TiaAlarmChannelsTest {
    @Test
    public void android7UsesAlarmStreamForEveryExactOwnedChannel() {
        for (int sdk : new int[] { 24, 25 }) {
            for (String sound : new String[] { "dawn", "chime", "pulse" }) {
                assertTrue(TiaAlarmChannels.usesLegacyAlarmStream(sdk, "tia-alarm-v1-" + sound));
            }
        }
    }

    @Test
    public void android8AndNewerKeepTheirExistingOsChannelPolicy() {
        for (int sdk : new int[] { 26, 28, 33, 34, 36 }) {
            for (String sound : new String[] { "dawn", "chime", "pulse" }) {
                assertFalse(TiaAlarmChannels.usesLegacyAlarmStream(sdk, "tia-alarm-v1-" + sound));
            }
        }
    }

    @Test
    public void ordinaryLegacyUnknownAndLookalikeChannelsKeepTheDefaultStream() {
        for (int sdk : new int[] { 24, 25, 26, 36 }) {
            for (String channel : new String[] { null, "", "approved-notifications", "approved-local-notifications",
                "urgent-overdue", "tia-alarm-v1-", "tia-alarm-v1-unknown", "tia-alarm-v2-dawn",
                "tia-alarm-v1-dawn-extra", "TIA-ALARM-V1-DAWN", "tia-alarm-v1-dawn " }) {
                assertFalse(TiaAlarmChannels.usesLegacyAlarmStream(sdk, channel));
            }
        }
        assertFalse(TiaAlarmChannels.usesLegacyAlarmStream(23, "tia-alarm-v1-dawn"));
    }
}
