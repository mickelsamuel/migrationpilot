from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("shop", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="order",
            name="placed_at",
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddIndex(
            model_name="order",
            index=models.Index(fields=["placed_at"], name="shop_order_placed_idx"),
        ),
    ]
