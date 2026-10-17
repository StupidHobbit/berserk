#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Лилит: the three servants' gifts ascend into her raised skull chalice.
// Anchors measured on the 496 x 700 base WebP, with a top-left origin.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.28,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 tribute(float f, float branch) {
    vec2 a=vec2(0.416,0.512);
    vec2 b=vec2(0.650,0.548);
    vec2 c=vec2(0.876,0.285);
    if(branch<0.5) {
        a=vec2(0.088,0.390);
        b=vec2(0.145,0.195);
        c=vec2(0.421,0.169);
    } else if(branch>1.5) {
        a=vec2(0.912,0.478);
        b=vec2(0.965,0.327);
        c=vec2(0.782,0.257);
    }
    vec2 d=vec2(0.598,0.211);
    float g=1.0-f;
    return a*g*g*g+3.0*b*g*g*f+3.0*c*g*f*f+d*f*f*f;
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    // The name, class strip, protection medallion and skeletal stat frame
    // are excluded. The small fade ends above the highest frame fingers.
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.536,0.546,p.y));
    art*=smoothstep(0.010,0.024,p.x)*(1.0-smoothstep(0.977,0.990,p.x));
    art*=smoothstep(0.055,0.066,length((p-vec2(0.109,0.180))*vec2(1.0,1.4113)));
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float pulse=0.5+0.5*sin(t*1.65+seed*6.2831853);

    // Narrow red tributaries curl through the open sky and beside the throne.
    // Each carries a travelling golden soul, rather than moving the scan.
    float thread=0.0;
    float smoke=0.0;
    float gift=0.0;
    for(int i=0;i<30;i++) {
        float k=float(i);
        float branch=floor(k/10.0);
        float f=mod(k,10.0)/10.0;
        vec2 a=tribute(f,branch);
        vec2 b=tribute(f+0.1,branch);
        float d=segment(p,a,b);
        float progress=fract(t*0.19+branch*0.3333+seed*0.25);
        float moving=exp(-pow((f+0.05-progress)/0.12,2.0));
        float strength=0.42+0.58*pow(0.5+0.5*sin(f*18.0-t*3.0+branch*2.1),2.0);
        float core=1.0-smoothstep(0.0006,0.0016+aa*0.7,d);
        float halo=exp(-d*d/0.00011);
        thread=max(thread,core*strength);
        smoke=max(smoke,halo*strength);
        gift=max(gift,(halo*0.54+core)*moving);
    }
    color+=(1.0-color)*vec3(0.29,0.018,0.055)*smoke;
    color+=vec3(0.25,0.029,0.035)*thread;
    color+=vec3(0.40,0.22,0.055)*gift;

    // The skull's sockets and rim store the gifts for her next discharge.
    float skull=oval(p,vec2(0.599,0.210),vec2(0.036,0.036));
    float rim=oval(p,vec2(0.601,0.188),vec2(0.029,0.006));
    float socket=oval(p,vec2(0.586,0.205),vec2(0.006,0.005))
                +oval(p,vec2(0.607,0.207),vec2(0.006,0.005));
    color+=(1.0-color)*vec3(0.44,0.15,0.035)*skull*(0.42+0.58*pulse);
    color+=vec3(0.61,0.10,0.055)*(rim*0.85+socket)*(0.68+0.32*pulse);
    float jewel=oval(p,vec2(0.451,0.285),vec2(0.017,0.019));
    color+=(1.0-color)*vec3(0.70,0.29,0.06)*jewel*(0.55+0.45*pulse);

    // Subordinate demons answer with red eyes and a breathing ember glow.
    float servants=oval(p,vec2(0.413,0.502),vec2(0.085,0.052))
                  +oval(p,vec2(0.913,0.470),vec2(0.086,0.062))
                  +oval(p,vec2(0.090,0.391),vec2(0.077,0.058));
    float redInk=smoothstep(0.03,0.20,scan.r-scan.g);
    color+=vec3(0.095,0.009,0.004)*servants*redInk*(0.35+0.65*pulse);
    float eyes=oval(p,vec2(0.418,0.521),vec2(0.008,0.005))
              +oval(p,vec2(0.935,0.481),vec2(0.006,0.005));
    color+=vec3(0.48,0.075,0.015)*eyes*(0.65+0.35*pulse);

    if(u_is_foil) {
        // Broad gold / garnet interference embosses the throne and regalia.
        // A static embossed field keeps foil unmistakable at reduced motion.
        float robe=oval(p,vec2(0.477,0.359),vec2(0.210,0.112));
        float throne=oval(p,vec2(0.563,0.475),vec2(0.389,0.093));
        float face=oval(p,vec2(0.450,0.235),vec2(0.058,0.056));
        float legs=oval(p,vec2(0.670,0.379),vec2(0.180,0.060));
        float finish=clamp(0.32+robe*0.39+throne*0.36+servants*0.18,0.0,0.92);
        finish*=1.0-clamp(face*0.92+legs*0.83,0.0,0.92);
        float field=p.x*1.85+p.y*3.3+0.12*sin(p.x*14.0-p.y*22.0)+t*0.08+seed*0.2;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(field+vec3(0.0,0.333,0.667)));
        vec3 metal=mix(vec3(0.81,0.48,0.17),spectrum,0.66);
        vec3 coated=mix(2.0*color*metal,1.0-2.0*(1.0-color)*(1.0-metal),step(vec3(0.5),color));
        color=mix(color,coated,finish*0.59);
        float sheen=pow(0.5+0.5*sin(field*8.0-t*0.8),6.0);
        color+=(1.0-color)*(vec3(0.065,0.045,0.018)+metal*0.18)*finish;
        color+=(1.0-color)*mix(vec3(1.0,0.80,0.43),spectrum,0.55)*sheen*finish
               *(0.22+0.25*smoothstep(0.13,0.65,lum));
        color+=vec3(0.16,0.11,0.025)*skull*(0.5+0.5*sheen);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
