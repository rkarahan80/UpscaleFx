import tensorflow as tf
from tensorflow.keras.layers import Conv2D, UpSampling2D, Input
from tensorflow.keras.models import Model

def get_basic_sr_model(scale_factor=2, input_shape=(None, None, 3)):
    inputs = Input(shape=input_shape)
    x = Conv2D(64, (5, 5), padding='same', activation='relu')(inputs)
    x = Conv2D(64, (3, 3), padding='same', activation='relu')(x)

    if scale_factor == 2:
        x = UpSampling2D(size=(2, 2), interpolation='bilinear')(x)
    elif scale_factor == 4:
        x = UpSampling2D(size=(2, 2), interpolation='bilinear')(x)
        x = Conv2D(64, (3,3), padding='same', activation='relu')(x)
        x = UpSampling2D(size=(2, 2), interpolation='bilinear')(x)
    else:
        print(f"Warning: Basic model using UpSampling2D with size=({scale_factor}, {scale_factor}). May not be optimal.")
        x = UpSampling2D(size=(scale_factor, scale_factor), interpolation='bilinear')(x)

    outputs = Conv2D(3, (3, 3), padding='same', activation='sigmoid')(x)
    model = Model(inputs, outputs, name="basic_sr_model")
    print(f"Basic SR Model created with scale factor: {scale_factor}, input_shape: {input_shape}")
    # model.summary() # Keep summary but call it explicitly after model creation if needed
    return model

if __name__ == '__main__':
    model_2x = get_basic_sr_model(scale_factor=2)
    model_2x.summary()
