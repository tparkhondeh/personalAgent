package ir.wealthos.personalagent;

public final class HamrahApplication extends android.app.Application {
    @Override public void onCreate() {
        super.onCreate();
        AppearanceController.applyMode(this);
    }
}
