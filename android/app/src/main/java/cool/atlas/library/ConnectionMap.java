package cool.atlas.library;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.MotionEvent;
import android.view.View;
import java.util.List;
import java.util.function.IntConsumer;

final class ConnectionMap extends View {
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final String center;
  private final List<String> neighbors;
  private final IntConsumer onOpen;
  private int pressed = -1;

  ConnectionMap(Context context, String center, List<String> neighbors, IntConsumer onOpen) {
    super(context);
    this.center = center;
    this.neighbors = neighbors.subList(0, Math.min(12, neighbors.size()));
    this.onOpen = onOpen;
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    setClickable(true);
  }

  private float nodeX(int i) {
    return getWidth() / 2f + (float) Math.cos(angle(i)) * getWidth() * .32f;
  }
  private float nodeY(int i) {
    return getHeight() / 2f + (float) Math.sin(angle(i)) * getHeight() * .32f;
  }
  private double angle(int index) {
    return -Math.PI / 2 + Math.PI * 2 * index / Math.max(1, neighbors.size());
  }

  @Override protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    float x = getWidth() / 2f, y = getHeight() / 2f;
    float density = getResources().getDisplayMetrics().density;
    paint.setStrokeWidth(density);
    paint.setColor(Color.rgb(90, 112, 151));
    for (int i=0;i<neighbors.size();i++) canvas.drawLine(x,y,nodeX(i),nodeY(i),paint);
    paint.setTextAlign(Paint.Align.CENTER);
    paint.setTextSize(11 * density);
    paint.setColor(Color.rgb(171,196,246));
    canvas.drawCircle(x,y,7 * density,paint);
    canvas.drawText(shortTitle(center),x,y+22*density,paint);
    for (int i=0;i<neighbors.size();i++) {
      paint.setColor(i == pressed ? Color.WHITE : Color.rgb(156,180,218));
      canvas.drawCircle(nodeX(i),nodeY(i),5*density,paint);
      if (neighbors.size() <= 8) canvas.drawText(shortTitle(neighbors.get(i)),nodeX(i),nodeY(i)+17*density,paint);
    }
  }

  private String shortTitle(String title) {
    return title.length() <= 15 ? title : title.substring(0,14) + "…";
  }

  @Override public boolean onTouchEvent(MotionEvent event) {
    if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
      pressed = -1;
      double best = 24 * getResources().getDisplayMetrics().density;
      for (int i=0;i<neighbors.size();i++) {
        double distance = Math.hypot(nodeX(i)-event.getX(),nodeY(i)-event.getY());
        if (distance < best) { best = distance; pressed = i; }
      }
      invalidate();
      return pressed >= 0;
    }
    if (event.getActionMasked() == MotionEvent.ACTION_UP) {
      performClick();
      return true;
    }
    if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
      pressed = -1;
      invalidate();
    }
    return true;
  }

  @Override public boolean performClick() {
    super.performClick();
    if (pressed >= 0) onOpen.accept(pressed);
    pressed = -1;
    invalidate();
    return true;
  }
}
