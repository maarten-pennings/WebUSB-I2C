# WebUSB-I2C
Sending commands from a browser (web page with JavaScript) via a WebUSB dongle to an I2C slave.

## Introduction
This project implements a WebUSB to I2C dongle, and uses the ENS210 I2C slave as an example.

From a hardware perspective, the system consists of a PC, the WebUSB-I2C dongle, and an I2C slave like the ENS210 from ams.
The dongle has two connectors. The first connector is a USB connecter which allows plugging the dongle into a PC. 
The second connector is a four pin header with I2C (SCL, SDA) and power (VDD and GND). 
Note that our dongle includes a 

This project has two major components.
First it contains a firmware for an arduino Pro Mini. This is a "dongle"; a board with a USB connector and an atmega32u4 microcontroller. 
This controller has embedded USB hardware, which means that the firmware can implement the wanted USB fucntionality. The firmware in 
this project implements a Web USB CDC stack (see [WebUSB-LED](https://github.com/maarten-pennings/WebUSB-LED) for an intro). The firmware also implements a simple command interpreter: commands to write or read bytes over the I2C bus.

in a web page can send an receive characters to the dongle. The firmware also co

## WebUSB dongle
P
