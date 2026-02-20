from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext
import sys
import setuptools

# Pybind11 Integration
class get_pybind_include(object):
    """Helper class to determine the pybind11 include path
    The purpose of this class is to postpone importing pybind11 until it is actually
    installed, so that the ``get_include()`` method can be invoked. """

    def __str__(self):
        import pybind11
        return pybind11.get_include()

ext_modules = [
    Extension(
        'mis_cpp',
        ['cpp_wrapper.cpp'],
        include_dirs=[
            # Path to pybind11 headers
            get_pybind_include(),
            # Path to your C++ headers (e.g. ../../../MIS/)
            '/Users/dawid/Doktorat/MIS' 
        ],
        language='c++'
    ),
]

setup(
    name='mis_cpp',
    version='0.1',
    author='Dawid',
    description='C++ Backend for MIS',
    ext_modules=ext_modules,
    setup_requires=['pybind11>=2.5.0'],
    install_requires=['pybind11>=2.5.0'],
)
